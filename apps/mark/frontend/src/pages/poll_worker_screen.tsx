import { DateTime } from 'luxon';
import React, { useState, useEffect } from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  PrecinctId,
  Tally,
  PrecinctSelection,
  PollsState,
  PollsTransition,
  getPartyIdsWithContests,
  InsertedSmartCardAuth,
  BallotStyle,
} from '@votingworks/types';
import {
  Button,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  Devices,
  getSignedQuickResultsReportingUrl,
  Loading,
  Main,
  Modal,
  PrecinctScannerTallyReports,
  printElement,
  Prose,
  Screen,
  Text,
  PrecinctScannerBallotCountReport,
  ElectionInfoBar,
  TestMode,
  NoWrap,
  useQueryChangeListener,
  H1,
  Font,
  H3,
  SegmentedButton,
  P,
  H6,
  H4,
  Caption,
  H5,
} from '@votingworks/ui';

import {
  ReportSourceMachineType,
  readCompressedTally,
  getPrecinctSelectionName,
  getTallyIdentifier,
  Hardware,
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsReportTitle,
  getPollsTransitionAction,
  isValidPollsStateChange,
  getPollTransitionsFromState,
  ScannerReportData,
  ScannerTallyReportData,
  isPollsSuspensionTransition,
  ScannerBallotCountReportData,
} from '@votingworks/utils';

import { LogEventId, Logger } from '@votingworks/logging';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { MachineConfig } from '@votingworks/mark-backend';
import styled from 'styled-components';
import { assert, find, sleep, throwIllegalValue } from '@votingworks/basics';
import { ScreenReader } from '../config/types';

import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';
import { DiagnosticsScreen } from './diagnostics_screen';
import {
  clearScannerReportDataFromCard,
  getScannerReportDataFromCard,
} from '../api';

function parseScannerReportTallyData(
  scannerTallyReportData: ScannerTallyReportData,
  election: Election
) {
  assert(
    scannerTallyReportData.tallyMachineType ===
      ReportSourceMachineType.PRECINCT_SCANNER
  );
  const partyIds = getPartyIdsWithContests(election);
  const newSubTallies = new Map<string, Tally>();
  // Read the tally for each precinct and each party
  if (scannerTallyReportData.talliesByPrecinct) {
    for (const [precinctId, compressedTally] of Object.entries(
      scannerTallyReportData.talliesByPrecinct
    )) {
      assert(compressedTally);
      // partyId may be undefined in the case of a ballot style without a party in the election
      for (const partyId of partyIds) {
        const key = getTallyIdentifier(partyId, precinctId);
        const tally = readCompressedTally(
          election,
          compressedTally,
          scannerTallyReportData.ballotCounts[key] ?? [0, 0],
          partyId
        );
        newSubTallies.set(key, tally);
      }
    }
  } else {
    for (const partyId of partyIds) {
      const key = getTallyIdentifier(
        partyId,
        scannerTallyReportData.precinctSelection.kind === 'SinglePrecinct'
          ? scannerTallyReportData.precinctSelection.precinctId
          : undefined
      );
      const tally = readCompressedTally(
        election,
        scannerTallyReportData.tally,
        scannerTallyReportData.ballotCounts[key] ?? [0, 0],
        partyId
      );
      newSubTallies.set(key, tally);
    }
  }
  return {
    overallTally: scannerTallyReportData.tally,
    subTallies: newSubTallies,
  };
}

function isScannerBallotCountReportData(
  scannerReportData: ScannerReportData
): scannerReportData is ScannerBallotCountReportData {
  return isPollsSuspensionTransition(scannerReportData.pollsTransition);
}

type ScannerReportModalState = 'initial' | 'printing' | 'reprint';

function ScannerReportModal({
  electionDefinition,
  scannerReportData,
  machineConfig,
  pollsState,
  updatePollsState,
  onClose,
  logger,
}: {
  electionDefinition: ElectionDefinition;
  scannerReportData: ScannerReportData;
  machineConfig: MachineConfig;
  pollsState: PollsState;
  updatePollsState: (pollsState: PollsState) => void;
  onClose: VoidFunction;
  logger: Logger;
}) {
  const [modalState, setModalState] =
    useState<ScannerReportModalState>('initial');

  const precinctScannerPollsState = getPollsTransitionDestinationState(
    scannerReportData.pollsTransition
  );
  const [willUpdatePollsToMatchScanner] = useState(
    isValidPollsStateChange(pollsState, precinctScannerPollsState)
  );

  const clearScannerReportDataFromCardMutation =
    clearScannerReportDataFromCard.useMutation(electionDefinition.electionHash);

  async function printReport(copies: number) {
    const report = await (async () => {
      if (isScannerBallotCountReportData(scannerReportData)) {
        return (
          <PrecinctScannerBallotCountReport
            electionDefinition={electionDefinition}
            precinctSelection={scannerReportData.precinctSelection}
            pollsTransition={scannerReportData.pollsTransition}
            totalBallotsScanned={scannerReportData.totalBallotsScanned}
            isLiveMode={scannerReportData.isLiveMode}
            pollsTransitionedTime={scannerReportData.timePollsTransitioned}
            precinctScannerMachineId={scannerReportData.machineId}
          />
        );
      }

      const parsedScannerTallyReportData = parseScannerReportTallyData(
        scannerReportData,
        electionDefinition.election
      );
      const signedQuickResultsReportingUrl =
        await getSignedQuickResultsReportingUrl({
          electionDefinition,
          isLiveMode: scannerReportData.isLiveMode,
          compressedTally: parsedScannerTallyReportData.overallTally,
          signingMachineId: machineConfig.machineId,
        });
      return (
        <PrecinctScannerTallyReports
          electionDefinition={electionDefinition}
          precinctSelection={scannerReportData.precinctSelection}
          subTallies={parsedScannerTallyReportData.subTallies}
          hasPrecinctSubTallies={Boolean(scannerReportData.talliesByPrecinct)}
          pollsTransition={scannerReportData.pollsTransition}
          isLiveMode={scannerReportData.isLiveMode}
          pollsTransitionedTime={scannerReportData.timePollsTransitioned}
          totalBallotsScanned={scannerReportData.totalBallotsScanned}
          precinctScannerMachineId={scannerReportData.machineId}
          signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
        />
      );
    })();

    await printElement(report, {
      sides: 'one-sided',
      copies,
    });
    const reportTitle = getPollsReportTitle(
      scannerReportData.pollsTransition
    ).toLowerCase();
    const reportPrecinctName = getPrecinctSelectionName(
      electionDefinition.election.precincts,
      scannerReportData.precinctSelection
    );
    await logger.log(LogEventId.TallyReportPrinted, 'poll_worker', {
      disposition: 'success',
      message: `Printed ${copies} copies of a ${reportTitle} for ${reportPrecinctName} exported from scanner ${scannerReportData.machineId}.`,
      scannerPollsTransition: scannerReportData.pollsTransition,
      timePollsTransitionedOnScanner: scannerReportData.timePollsTransitioned,
      timeReportSavedToCard: scannerReportData.timeSaved,
      totalBallotsScanned: scannerReportData.totalBallotsScanned,
    });
    await sleep(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
  }

  async function printReportsAndUpdatePolls() {
    setModalState('printing');
    try {
      await printReport(DEFAULT_NUMBER_POLL_REPORT_COPIES);
      let wasClearingSuccessful = false;
      try {
        wasClearingSuccessful = (
          await clearScannerReportDataFromCardMutation.mutateAsync()
        ).isOk();
      } catch {
        // Handled by default query client error handling
      }
      if (wasClearingSuccessful) {
        await logger.log(LogEventId.TallyReportClearedFromCard, 'poll_worker', {
          disposition: 'success',
        });
      } else {
        await logger.log(LogEventId.TallyReportClearedFromCard, 'poll_worker', {
          disposition: 'failure',
          message: 'Failed to clear report from card.',
        });
      }
      if (willUpdatePollsToMatchScanner) {
        updatePollsState(precinctScannerPollsState);
      }
    } finally {
      setModalState('reprint');
    }
  }

  async function printAdditionalReport() {
    setModalState('printing');
    try {
      await printReport(1);
    } finally {
      setModalState('reprint');
    }
  }

  let modalContent: React.ReactNode = null;
  let modalActions: React.ReactNode = null;

  const reportTitle = getPollsReportTitle(scannerReportData.pollsTransition);
  const newPollsStateName = getPollsStateName(precinctScannerPollsState);

  switch (modalState) {
    case 'initial':
      modalContent = (
        <Prose id="modalaudiofocus">
          <H1>{reportTitle} on Card</H1>
          {willUpdatePollsToMatchScanner ? (
            <p>
              This poll worker card contains a {reportTitle.toLowerCase()}.
              After printing, the report will be cleared from the card and the
              polls will be {newPollsStateName.toLowerCase()} on VxMark.
            </p>
          ) : (
            <p>
              This poll worker card contains a {reportTitle.toLowerCase()}.
              After printing, the report will be cleared from the card.
            </p>
          )}
        </Prose>
      );
      modalActions = willUpdatePollsToMatchScanner ? (
        <Button variant="primary" onPress={printReportsAndUpdatePolls}>
          {getPollsTransitionAction(scannerReportData.pollsTransition)} and
          Print Report
        </Button>
      ) : (
        <Button variant="primary" onPress={printReportsAndUpdatePolls}>
          Print Report
        </Button>
      );
      break;
    case 'printing':
      modalContent = (
        <Prose textCenter id="modalaudiofocus">
          <Loading>{`Printing ${reportTitle.toLowerCase()}`}</Loading>
        </Prose>
      );
      break;
    case 'reprint':
      modalContent = (
        <Prose id="modalaudiofocus">
          <H1>{reportTitle} Printed</H1>
          {willUpdatePollsToMatchScanner ? (
            <p>
              The polls are now {newPollsStateName.toLowerCase()}. If needed,
              you may print additional copies of the polls opened report.
            </p>
          ) : (
            <p>
              If needed, you may print additional copies of the polls opened
              report.
            </p>
          )}
        </Prose>
      );
      modalActions = (
        <React.Fragment>
          <Button variant="primary" onPress={onClose}>
            Continue
          </Button>
          <Button onPress={printAdditionalReport}>
            Print Additional Report
          </Button>
        </React.Fragment>
      );
      break;
    /* istanbul ignore next - compile time check for completeness */
    default:
      throwIllegalValue(modalState);
  }

  return (
    <Modal
      // This modal is torn down in some way which react-modal doesn't expect
      // and as a result, can leave the app hidden from the accessibility
      // tree. We set this prop to false to disable hiding the app.
      // https://github.com/votingworks/vxsuite/issues/2618
      ariaHideApp={false}
      content={modalContent}
      actions={modalActions}
    />
  );
}

const VotingSession = styled.div`
  margin: 30px 0 60px;
  border: 2px solid #000000;
  border-radius: 20px;
  padding: 30px 40px;
  & > *:first-child {
    margin-top: 0;
  }
  & > *:last-child {
    margin-bottom: 0;
  }
`;

const UpdatePollsDirectlyActionsSpan = styled.span`
  display: flex;
  width: 100%;

  & > * {
    flex-grow: 1;
    margin: 0.25rem;
  }
`;

function UpdatePollsDirectlyButton({
  pollsTransition,
  updatePollsState,
}: {
  pollsTransition: PollsTransition;
  updatePollsState: (pollsState: PollsState) => void;
}): JSX.Element {
  const [isConfirmationModalOpen, setIsConfirmationModalOpen] = useState(false);

  function closeModal() {
    setIsConfirmationModalOpen(false);
  }

  function confirmUpdate() {
    updatePollsState(getPollsTransitionDestinationState(pollsTransition));
    closeModal();
  }

  const action = getPollsTransitionAction(pollsTransition);
  const reportTitle = getPollsReportTitle(pollsTransition);
  const suggestVxScanText = (() => {
    switch (pollsTransition) {
      case 'open_polls':
        return `Open polls on VxScan to save the ${reportTitle.toLowerCase()} before opening polls on VxMark.`;
      case 'pause_voting':
        return `Pause voting on VxScan to save the ${reportTitle.toLowerCase()} before pausing voting on VxMark.`;
      case 'resume_voting':
        return `Resume voting on VxScan to save the ${reportTitle.toLowerCase()} before resuming voting on VxMark.`;
      case 'close_polls':
        return `Close polls on VxScan to save the ${reportTitle.toLowerCase()} before closing polls on VxMark.`;
      /* istanbul ignore next */
      default:
        throwIllegalValue(pollsTransition);
    }
  })();

  return (
    <React.Fragment>
      <Button onPress={() => setIsConfirmationModalOpen(true)}>{action}</Button>
      {isConfirmationModalOpen && (
        <Modal
          centerContent
          content={
            <React.Fragment>
              <H1>No {reportTitle} on Card</H1>
              <P>{suggestVxScanText}</P>
            </React.Fragment>
          }
          actions={
            <UpdatePollsDirectlyActionsSpan>
              <Button onPress={confirmUpdate}>{action} on VxMark Now</Button>
              <Button variant="primary" onPress={closeModal}>
                Cancel
              </Button>
            </UpdatePollsDirectlyActionsSpan>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}

export interface PollworkerScreenProps {
  pollWorkerAuth: InsertedSmartCardAuth.PollWorkerLoggedIn;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  resetCardlessVoterSession: () => void;
  appPrecinct: PrecinctSelection;
  electionDefinition: ElectionDefinition;
  enableLiveMode: () => void;
  hasVotes: boolean;
  isLiveMode: boolean;
  pollsState: PollsState;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  hardware: Hardware;
  devices: Devices;
  screenReader: ScreenReader;
  updatePollsState: (pollsState: PollsState) => void;
  reload: () => void;
  logger: Logger;
}

export function PollWorkerScreen({
  pollWorkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,
  electionDefinition,
  enableLiveMode,
  isLiveMode,
  pollsState,
  ballotsPrintedCount,
  machineConfig,
  hardware,
  devices,
  screenReader,
  updatePollsState,
  hasVotes,
  reload,
  logger,
}: PollworkerScreenProps): JSX.Element {
  const { election, electionHash } = electionDefinition;
  const electionDate = DateTime.fromISO(electionDefinition.election.date);
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day');

  const scannerReportDataFromCardQuery =
    getScannerReportDataFromCard.useQuery(electionHash);
  const [scannerReportDataToBePrinted, setScannerReportDataToBePrinted] =
    useState<ScannerReportData>();

  /**
   * We populate a scannerReportDataToBePrinted state value and don't use
   * scannerReportDataFromCardQuery directly to control the scanner report modal because:
   * 1. We support printing additional copies of the report even after report data has been cleared
   *    from the card
   * 2. We still want to be able to close the modal even if clearing report data fails
   */
  useQueryChangeListener(
    scannerReportDataFromCardQuery,
    (newScannerReportDataFromCardResult) => {
      const newScannerReportDataFromCard =
        newScannerReportDataFromCardResult.ok();
      if (
        !scannerReportDataToBePrinted &&
        newScannerReportDataFromCard &&
        newScannerReportDataFromCard.isLiveMode === isLiveMode
      ) {
        setScannerReportDataToBePrinted(newScannerReportDataFromCard);
      }
    }
  );

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === 'SinglePrecinct' ? appPrecinct.precinctId : undefined
    );

  const precinctBallotStyles: BallotStyle[] = selectedCardlessVoterPrecinctId
    ? election.ballotStyles.filter((bs) =>
        bs.precincts.includes(selectedCardlessVoterPrecinctId)
      )
    : [];
  /*
   * Various state parameters to handle controlling when certain modals on the page are open or not.
   * If you are adding a new modal make sure to add the new parameter to the triggerAudiofocus useEffect
   * dependency. This will retrigger the audio to explain landing on the PollWorker homepage
   * when the modal closes.
   */
  const [isConfirmingEnableLiveMode, setIsConfirmingEnableLiveMode] = useState(
    !isLiveMode && isElectionDay
  );
  function cancelEnableLiveMode() {
    return setIsConfirmingEnableLiveMode(false);
  }
  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (!isConfirmingEnableLiveMode && !scannerReportDataToBePrinted) {
      triggerAudioFocus();
    }
  }, [isConfirmingEnableLiveMode, scannerReportDataToBePrinted]);

  const canSelectBallotStyle = pollsState === 'polls_open';
  const [isHidingSelectBallotStyle, setIsHidingSelectBallotStyle] =
    useState(false);

  function confirmEnableLiveMode() {
    enableLiveMode();
    setIsConfirmingEnableLiveMode(false);
  }

  if (hasVotes && pollWorkerAuth.cardlessVoterUser) {
    return (
      <Screen white>
        <Main centerChild>
          <Prose textCenter>
            <H1
              aria-label={`Ballot style ${pollWorkerAuth.cardlessVoterUser.ballotStyleId} has been activated.`}
            >
              Ballot Contains Votes
            </H1>
            <p>
              Remove card to allow voter to continue voting, or reset ballot.
            </p>
            <p>
              <Button variant="danger" onPress={resetCardlessVoterSession}>
                Reset Ballot
              </Button>
            </p>
          </Prose>
        </Main>
      </Screen>
    );
  }

  if (pollWorkerAuth.cardlessVoterUser) {
    const { precinctId, ballotStyleId } = pollWorkerAuth.cardlessVoterUser;
    const precinct = find(election.precincts, (p) => p.id === precinctId);

    return (
      <Screen white>
        <Main centerChild padded>
          <H1 align="center">
            Voting Session Active: {ballotStyleId} at{' '}
            <Font noWrap>{precinct.name}</Font>
          </H1>
          <ol>
            <li>
              <P>
                Instruct the voter to press the{' '}
                <Font weight="bold" noWrap>
                  Start Voting
                </Font>{' '}
                button on the next screen.
              </P>
            </li>
            <li>
              <P>Remove the poll worker card to continue.</P>
            </li>
          </ol>
          <H6 as="h2">OR</H6>
          <Text center>Deactivate this voter session to start over.</Text>
          <Text center>
            <Button small onPress={resetCardlessVoterSession}>
              Deactivate Voting Session
            </Button>
          </Text>
        </Main>
      </Screen>
    );
  }

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        hardware={hardware}
        devices={devices}
        screenReader={screenReader}
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
      />
    );
  }

  return (
    <React.Fragment>
      <Screen white>
        {!isLiveMode && <TestMode />}
        <Main padded>
          <H1>
            VxMark{' '}
            <Text as="span" light noWrap>
              Poll Worker Actions
            </Text>
          </H1>
          <H4 as="h2" noWrap>
            <Font weight="light">Ballots Printed:</Font> {ballotsPrintedCount}
          </H4>
          <H4 as="h2" noWrap>
            <Font weight="light">Polls:</Font>
            {getPollsStateName(pollsState)}
          </H4>
          {canSelectBallotStyle && !isHidingSelectBallotStyle ? (
            <React.Fragment>
              <VotingSession>
                <H3>Start a New Voting Session</H3>
                {appPrecinct.kind === 'AllPrecincts' && (
                  <React.Fragment>
                    <H5 as="h4">1. Select Voter’s Precinct</H5>
                    <SegmentedButton
                      onChange={setSelectedCardlessVoterPrecinctId}
                      options={election.precincts.map((precinct) => ({
                        ariaLabel: `Activate Voter Session for Precinct ${precinct.name}`,
                        id: precinct.id,
                        label: precinct.name,
                      }))}
                      selectedOptionId={selectedCardlessVoterPrecinctId}
                      vertical
                    />
                  </React.Fragment>
                )}
                <H5 as="h4">
                  {appPrecinct.kind === 'AllPrecincts' ? '2. ' : ''}Select
                  Voter’s Ballot Style
                </H5>
                {selectedCardlessVoterPrecinctId ? (
                  <SegmentedButton
                    data-testid="ballot-styles"
                    onChange={(id) =>
                      activateCardlessVoterSession(
                        selectedCardlessVoterPrecinctId,
                        id
                      )
                    }
                    options={precinctBallotStyles.map((ballotStyle) => ({
                      id: ballotStyle.id,
                      label: ballotStyle.id,
                    }))}
                  />
                ) : (
                  <Caption italic>
                    Select the voter’s precinct above to view ballot styles for
                    the precinct.
                  </Caption>
                )}
              </VotingSession>
              <Button onPress={() => setIsHidingSelectBallotStyle(true)}>
                View More Actions
              </Button>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <div /> {/* Enforces css margin from the following P tag. */}
              {canSelectBallotStyle && (
                <React.Fragment>
                  <p>
                    <Button
                      onPress={() => setIsHidingSelectBallotStyle(false)}
                      variant="previous"
                    >
                      Back to Ballot Style Selection
                    </Button>
                  </p>
                  <H1>More Actions</H1>
                </React.Fragment>
              )}
              <p>
                {getPollTransitionsFromState(pollsState).map(
                  (pollsTransition, index) => {
                    return (
                      <React.Fragment
                        key={`${pollsTransition}-directly-button`}
                      >
                        {index > 0 && ' or '}
                        <UpdatePollsDirectlyButton
                          pollsTransition={pollsTransition}
                          updatePollsState={updatePollsState}
                        />
                      </React.Fragment>
                    );
                  }
                )}
              </p>
              <p>
                <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                  System Diagnostics
                </Button>
              </p>
              <p>
                <Button onPress={reload}>Reset Accessible Controller</Button>
              </p>
            </React.Fragment>
          )}
        </Main>
        {isConfirmingEnableLiveMode && (
          <Modal
            centerContent
            content={
              <div id="modalaudiofocus">
                <H1>
                  Switch to Live Election Mode and reset the Ballots Printed
                  count?
                </H1>
                <P>
                  Today is election day and this machine is in{' '}
                  <strong>
                    <NoWrap>Test Ballot Mode.</NoWrap>
                  </strong>
                </P>
                <Text small italic>
                  Note: Switching back to Test Ballot Mode requires an{' '}
                  <NoWrap>Election Manager Card.</NoWrap>
                </Text>
              </div>
            }
            actions={
              <React.Fragment>
                <Button variant="danger" onPress={confirmEnableLiveMode}>
                  Switch to Official Ballot Mode
                </Button>
                <Button onPress={cancelEnableLiveMode}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        <ElectionInfoBar
          mode="admin"
          electionDefinition={electionDefinition}
          codeVersion={machineConfig.codeVersion}
          machineId={machineConfig.machineId}
          precinctSelection={appPrecinct}
        />
      </Screen>
      {scannerReportDataToBePrinted && (
        <ScannerReportModal
          scannerReportData={scannerReportDataToBePrinted}
          electionDefinition={electionDefinition}
          machineConfig={machineConfig}
          pollsState={pollsState}
          updatePollsState={updatePollsState}
          onClose={() => setScannerReportDataToBePrinted(undefined)}
          logger={logger}
        />
      )}
    </React.Fragment>
  );
}
