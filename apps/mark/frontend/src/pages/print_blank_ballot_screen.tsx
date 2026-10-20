import React from 'react';

import {
  type BallotStyleId,
  type Election,
  type ElectionDefinition,
  getConfiguredPrecinctsAndSplits,
  type LanguageCode,
  type PrecinctId,
  type PrintJobId,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import {
  format,
  getDefaultLanguageBallotStyleAndLanguage,
  getLanguageOptions,
  getRelatedBallotStyle,
} from '@votingworks/utils';
import type {
  BarcodePrintRequest,
  MachineConfig,
} from '@votingworks/mark-backend';
import { pollWorkerComponents } from '@votingworks/mark-flow-ui';
import {
  Button,
  Main,
  Screen,
  ElectionInfoBar,
  TestModeBanner,
  P,
  H4,
  getPrintJobDisplayStatus,
  Modal,
  Loading,
  SearchSelect,
  H2,
  PrintJobFailedModal,
} from '@votingworks/ui';

import styled from 'styled-components';

import { getPrintJobStatus, printBlankBallot } from '../api.js';

const Contents = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1rem;
`;

interface BallotSelection {
  readonly precinctId: PrecinctId;
  readonly ballotStyleId: BallotStyleId;
}

interface LockedBallotSelection {
  readonly selection: BallotSelection;
  readonly languageCode: LanguageCode;
}

function lockedSelectionForBarcodePrintRequest(
  election: Election,
  request: BarcodePrintRequest
): LockedBallotSelection {
  const { ballotStyleId, languageCode } = assertDefined(
    getDefaultLanguageBallotStyleAndLanguage({
      election,
      ballotStyleId: request.ballotStyleId,
    })
  );
  return {
    selection: { precinctId: request.precinctId, ballotStyleId },
    languageCode,
  };
}

export interface PrintBlankBallotScreenProps {
  isLiveMode: boolean;
  electionPackageHash: string;
  electionDefinition: ElectionDefinition;
  election: Election;
  machineConfig: MachineConfig;
  pollingPlaceId: string;
  /**
   * A ballot requested by a barcode scan. When set, the ballot options are
   * locked to it and the screen exits once its print finishes.
   */
  barcodePrintRequest?: BarcodePrintRequest;
  onExit: () => void;
}

export function PrintBlankBallotScreen({
  isLiveMode,
  electionPackageHash,
  electionDefinition,
  election,
  machineConfig,
  pollingPlaceId,
  barcodePrintRequest,
  onExit,
}: PrintBlankBallotScreenProps): JSX.Element {
  const { BallotStyleSelect } = pollWorkerComponents;
  const printBlankBallotMutation = printBlankBallot.useMutation();

  const [jobId, setJobId] = React.useState<PrintJobId>();
  const [isBarcodePrint, setIsBarcodePrint] = React.useState(false);
  const hasStartedPrint =
    printBlankBallotMutation.isLoading || jobId !== undefined;

  const printJobStatusQuery = getPrintJobStatus.useQuery(jobId);

  const [manualSelection, setManualSelection] =
    React.useState<BallotSelection>();
  const [manualLanguage, setManualLanguage] = React.useState<LanguageCode>();
  const barcodeSelection = React.useMemo(
    () =>
      barcodePrintRequest &&
      lockedSelectionForBarcodePrintRequest(election, barcodePrintRequest),
    [barcodePrintRequest, election]
  );
  const lockedSelection =
    hasStartedPrint && !isBarcodePrint ? undefined : barcodeSelection;
  const isLocked = lockedSelection !== undefined;
  const selection = lockedSelection?.selection ?? manualSelection;
  const selectedLanguage = lockedSelection?.languageCode ?? manualLanguage;
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
      setManualSelection({ precinctId, ballotStyleId });
      setManualLanguage(availableLanguagesFor(ballotStyleId)[0]);
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
    setIsBarcodePrint(isLocked);
    startPrint(precinctId, resolvedBallotStyleId);
  }, [
    election,
    isLocked,
    selectedLanguage,
    selection,
    showLanguagePicker,
    startPrint,
  ]);

  const printJobStatus = hasStartedPrint
    ? getPrintJobDisplayStatus(printJobStatusQuery.data)
    : undefined;
  const printOutcome = printJobStatus?.outcome;

  function onPrintFinished(): void {
    if (isLocked) {
      onExit();
    } else {
      setJobId(undefined);
    }
  }

  return (
    <Screen>
      {!isLiveMode && <TestModeBanner />}
      <Main padded>
        <Contents>
          <H2 as="h1">Blank Ballot Printing</H2>
          <Button icon="Previous" onPress={onExit}>
            Back
          </Button>
          <H4 as="h2">Ballot Style</H4>
          <BallotStyleSelect
            election={election}
            onSelect={onChooseBallotStyle}
            disabled={hasStartedPrint || isLocked}
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
                    setManualLanguage(value);
                  }
                }}
                style={{ width: '100%' }}
                disabled={hasStartedPrint || isLocked}
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
          actions={<Button onPress={onPrintFinished}>Done</Button>}
        />
      )}
      {printOutcome === 'failed' && (
        <PrintJobFailedModal
          multipleBallotsAttempted={false}
          reason={printJobStatus?.reason}
          onClose={onPrintFinished}
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
