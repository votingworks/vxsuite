import React from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  getConfiguredPrecinctsAndSplits,
  LanguageCode,
  PrecinctId,
  PrintJobId,
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
  getPrintOutcome,
  Modal,
  Loading,
  SearchSelect,
  H2,
} from '@votingworks/ui';

import styled from 'styled-components';

import { getPrintJobStatus, printBlankBallot } from '../api.js';

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

  const [jobId, setJobId] = React.useState<PrintJobId>();

  const printJobStatusQuery = getPrintJobStatus.useQuery(jobId);

  const [selection, setSelection] = React.useState<{
    precinctId: PrecinctId;
    ballotStyleId: BallotStyleId;
  }>();
  const [selectedLanguage, setSelectedLanguage] =
    React.useState<LanguageCode>();
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
      printBlankBallotMutation.mutate(
        { precinctId, ballotStyleId },
        { onSuccess: setJobId }
      );
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

  const hasStartedPrint =
    printBlankBallotMutation.isLoading || jobId !== undefined;
  const jobStatusResult = printJobStatusQuery.data;
  const jobStatus = jobStatusResult?.ok();

  const printOutcome = hasStartedPrint
    ? getPrintOutcome(jobStatusResult)
    : undefined;

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
            disabled={hasStartedPrint}
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
                  // @coverage-defer
                  if (value) {
                    setSelectedLanguage(value);
                  }
                }}
                style={{ width: '100%' }}
                disabled={hasStartedPrint}
              />
            </React.Fragment>
          )}
          <Button
            variant="primary"
            onPress={onPrint}
            disabled={hasStartedPrint}
          >
            Print Ballot
          </Button>
        </Contents>
      </Main>
      {printOutcome === 'in-progress' && (
        <Modal centerContent content={<Loading>Printing Ballot</Loading>} />
      )}
      {printOutcome === 'sent-to-printer' && (
        <Modal
          title="Ballot Printed"
          content={<P>Remove the printed ballot from the printer.</P>}
          actions={<Button onPress={() => setJobId(undefined)}>Done</Button>}
        />
      )}
      {printOutcome === 'failed' && (
        <Modal
          title="Ballot Not Printed"
          content={
            <React.Fragment>
              <P>The ballot was not sent to the printer.</P>
              {jobStatus?.reason && <P>{jobStatus.reason}</P>}
            </React.Fragment>
          }
          actions={<Button onPress={() => setJobId(undefined)}>Close</Button>}
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
