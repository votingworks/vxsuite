import React from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  getConfiguredPrecinctsAndSplits,
  LanguageCode,
  PrecinctId,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  format,
  getLanguageOptions,
  getRelatedBallotStyle,
} from '@votingworks/utils';
import { MachineConfig } from '@votingworks/mark-backend';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import {
  Button,
  Main,
  Screen,
  ElectionInfoBar,
  TestModeBanner,
  P,
  H4,
  Modal,
  Loading,
  SearchSelect,
  H2,
} from '@votingworks/ui';

import styled from 'styled-components';

import { BALLOT_PRINTING_TIMEOUT_SECONDS } from '../config/globals.js';
import { printBlankBallot } from '../api.js';

const Contents = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
`;

export interface PrintBlankBallotScreenProps {
  isLiveMode: boolean;
  electionPackageHash: string;
  electionDefinition: ElectionDefinition;
  election: Election;
  machineConfig: MachineConfig;
  pollingPlaceId: string;
  onBackButtonPress: () => void;
}

export function PrintBlankBallotScreen({
  isLiveMode,
  electionPackageHash,
  electionDefinition,
  election,
  machineConfig,
  pollingPlaceId,
  onBackButtonPress,
}: PrintBlankBallotScreenProps): JSX.Element {
  const { BallotStyleSelect } = pollWorkerComponents;
  const printBlankBallotMutation = printBlankBallot.useMutation();

  const [printStatus, setPrintStatus] = React.useState<
    'idle' | 'printing' | 'printed'
  >('idle');
  const [selection, setSelection] = React.useState<{
    precinctId: PrecinctId;
    ballotStyleId: BallotStyleId;
  }>();
  const [selectedLanguage, setSelectedLanguage] =
    React.useState<LanguageCode>();
  const printTimer = React.useRef(0);

  React.useEffect(() => () => clearTimeout(printTimer.current), []);

  // Language is encoded in the ballot style ID, so the languages a ballot style
  // is available in are the ones whose language-specific variant exists in its
  // group.
  const availableLanguagesFor = React.useCallback(
    (ballotStyleId: BallotStyleId): LanguageCode[] =>
      getLanguageOptions(election).filter((languageCode) =>
        getRelatedBallotStyle({
          ballotStyles: election.ballotStyles,
          sourceBallotStyleId: ballotStyleId,
          targetBallotStyleLanguage: languageCode,
        }).isOk()
      ),
    [election]
  );

  const startPrint = React.useCallback(
    (precinctId: PrecinctId, ballotStyleId: BallotStyleId) => {
      printBlankBallotMutation.mutate({ precinctId, ballotStyleId });
      setPrintStatus('printing');
      printTimer.current = window.setTimeout(() => {
        setPrintStatus('printed');
      }, BALLOT_PRINTING_TIMEOUT_SECONDS * 1000);
    },
    [printBlankBallotMutation]
  );

  const onChooseBallotStyle = React.useCallback(
    (precinctId: PrecinctId, ballotStyleId: BallotStyleId) => {
      setSelection({ precinctId, ballotStyleId });
      setSelectedLanguage(availableLanguagesFor(ballotStyleId)[0]);
    },
    [availableLanguagesFor]
  );

  const languageOptions = selection
    ? availableLanguagesFor(selection.ballotStyleId)
    : [];
  const showLanguagePicker = languageOptions.length > 1;

  const onPrint = React.useCallback(() => {
    const { precinctId, ballotStyleId } = assertDefined(selection);
    const resolvedBallotStyleId = showLanguagePicker
      ? getRelatedBallotStyle({
          ballotStyles: election.ballotStyles,
          sourceBallotStyleId: ballotStyleId,
          targetBallotStyleLanguage: assertDefined(selectedLanguage),
        }).unsafeUnwrap().id
      : ballotStyleId;
    startPrint(precinctId, resolvedBallotStyleId);
  }, [election, selectedLanguage, selection, showLanguagePicker, startPrint]);

  return (
    <Screen>
      {!isLiveMode && <TestModeBanner />}
      <Main padded>
        <Contents>
          <H2 as="h1">Blank Ballot Printing</H2>
          <Button icon="Previous" onPress={onBackButtonPress}>
            Back
          </Button>
          <H4 as="h2">Ballot Style</H4>
          <BallotStyleSelect
            election={election}
            onSelect={onChooseBallotStyle}
            disabled={printStatus !== 'idle'}
            selectedBallotStyleId={selection?.ballotStyleId}
            configuredPrecinctsAndSplits={getConfiguredPrecinctsAndSplits({
              election,
              pollingPlaceId,
            })}
          />
          {selection && showLanguagePicker && (
            <React.Fragment>
              <H4 as="h2">Language</H4>
              <SearchSelect
                aria-label="Ballot language"
                options={languageOptions.map((languageCode) => ({
                  value: languageCode,
                  label: format.languageDisplayName({ languageCode }),
                }))}
                value={selectedLanguage}
                onChange={(value) => {
                  if (value) {
                    setSelectedLanguage(value);
                  }
                }}
                style={{ width: '100%' }}
                disabled={printStatus !== 'idle'}
              />
            </React.Fragment>
          )}
          <Button
            variant="primary"
            onPress={onPrint}
            disabled={printStatus !== 'idle'}
          >
            Print Ballot
          </Button>
        </Contents>
      </Main>
      {printStatus === 'printing' && (
        <Modal centerContent content={<Loading>Printing Ballot</Loading>} />
      )}
      {printStatus === 'printed' && (
        <Modal
          title="Ballot Printed"
          content={<P>Remove the printed ballot from the printer.</P>}
          actions={<Button onPress={() => setPrintStatus('idle')}>Done</Button>}
        />
      )}
      <ElectionInfoBar
        mode="pollworker"
        electionDefinition={electionDefinition}
        electionPackageHash={electionPackageHash}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
        pollingPlaceId={pollingPlaceId}
      />
    </Screen>
  );
}
