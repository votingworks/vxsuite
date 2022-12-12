import { DateTime } from 'luxon';
import React, { useState, useEffect } from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  InsertedSmartcardAuth,
  PrecinctId,
  Tally,
  PrecinctSelection,
  PollsState,
  PollsTransition,
} from '@votingworks/types';
import {
  Button,
  ButtonList,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  Devices,
  fontSizeTheme,
  getSignedQuickResultsReportingUrl,
  HorizontalRule,
  Loading,
  Main,
  Modal,
  PrecinctScannerTallyReports,
  printElement,
  Prose,
  Screen,
  Text,
  PrecinctScannerBallotCountReport,
} from '@votingworks/ui';

import {
  assert,
  ReportSourceMachineType,
  find,
  readCompressedTally,
  getPrecinctSelectionName,
  getTallyIdentifier,
  Hardware,
  sleep,
  throwIllegalValue,
  getPollsTransitionDestinationState,
  getPollsStateName,
  getPollsReportTitle,
  getPollsTransitionAction,
  isValidPollsStateChange,
  getPollTransitionsFromState,
  ScannerReportData,
  ScannerTallyReportData,
  ScannerReportDataSchema,
  isPollsSuspensionTransition,
  ScannerBallotCountReportData,
} from '@votingworks/utils';

import { LogEventId, Logger } from '@votingworks/logging';
import styled from 'styled-components';
import { MachineConfig, ScreenReader } from '../config/types';

import { Sidebar, SidebarProps } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { VersionsData } from '../components/versions_data';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';
import { DiagnosticsScreen } from './diagnostics_screen';

function parseScannerReportTallyData(
  scannerTallyReportData: ScannerTallyReportData,
  election: Election
) {
  assert(
    scannerTallyReportData.tallyMachineType ===
      ReportSourceMachineType.PRECINCT_SCANNER
  );
  const parties = getPartyIdsInBallotStyles(election);
  const newSubTallies = new Map<string, Tally>();
  // Read the tally for each precinct and each party
  if (scannerTallyReportData.talliesByPrecinct) {
    for (const [precinctId, compressedTally] of Object.entries(
      scannerTallyReportData.talliesByPrecinct
    )) {
      assert(compressedTally);
      // partyId may be undefined in the case of a ballot style without a party in the election
      for (const partyId of parties) {
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
    for (const partyId of parties) {
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
  pollworkerAuth,
  machineConfig,
  pollsState,
  updatePollsState,
  onClose,
  logger,
}: {
  electionDefinition: ElectionDefinition;
  scannerReportData: ScannerReportData;
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn;
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
      /* istanbul ignore else */
      if ((await pollworkerAuth.card.clearStoredData()).isOk()) {
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
          <h1>{reportTitle} on Card</h1>
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
        <Button primary onPress={printReportsAndUpdatePolls}>
          {getPollsTransitionAction(scannerReportData.pollsTransition)} and
          Print Report
        </Button>
      ) : (
        <Button primary onPress={printReportsAndUpdatePolls}>
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
          <h1>{reportTitle} Printed</h1>
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
          <Button primary onPress={onClose}>
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
            <Prose textCenter id="modalaudiofocus">
              <h1>No {reportTitle} on Card</h1>
              <p>{suggestVxScanText}</p>
            </Prose>
          }
          actions={
            <UpdatePollsDirectlyActionsSpan>
              <Button onPress={confirmUpdate}>{action} on VxMark Now</Button>
              <Button primary onPress={closeModal}>
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
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  resetCardlessVoterSession: () => void;
  appPrecinct: PrecinctSelection;
  cardlessVoterSessionPrecinctId?: PrecinctId;
  cardlessVoterSessionBallotStyleId?: BallotStyleId;
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
  pollworkerAuth,
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
  const { election } = electionDefinition;
  const electionDate = DateTime.fromISO(electionDefinition.election.date);
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day');

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === 'SinglePrecinct' ? appPrecinct.precinctId : undefined
    );

  const precinctBallotStyles = selectedCardlessVoterPrecinctId
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
  const [scannerReportData, setScannerReportData] =
    useState<ScannerReportData>();
  useEffect(() => {
    if (scannerReportData) return;
    if (!pollworkerAuth.card.hasStoredData) return;
    async function loadTallyFromCard() {
      setScannerReportData(
        (
          await pollworkerAuth.card.readStoredObject(ScannerReportDataSchema)
        ).ok()
      );
    }
    void loadTallyFromCard();
  }, [pollworkerAuth, scannerReportData]);

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (!isConfirmingEnableLiveMode && !scannerReportData) {
      triggerAudioFocus();
    }
  }, [isConfirmingEnableLiveMode, scannerReportData]);

  const isPrintMode = machineConfig.appMode.isPrint;
  const isMarkAndPrintMode =
    machineConfig.appMode.isPrint && machineConfig.appMode.isMark;

  const canSelectBallotStyle =
    isMarkAndPrintMode && pollsState === 'polls_open';
  const [isHidingSelectBallotStyle, setIsHidingSelectBallotStyle] =
    useState(false);

  function confirmEnableLiveMode() {
    enableLiveMode();
    setIsConfirmingEnableLiveMode(false);
  }

  if (hasVotes && pollworkerAuth.activatedCardlessVoter) {
    return (
      <Screen>
        <Main centerChild>
          <Prose textCenter>
            <h1
              aria-label={`Ballot style ${pollworkerAuth.activatedCardlessVoter.ballotStyleId} has been activated.`}
            >
              Ballot Contains Votes
            </h1>
            <p>
              Remove card to allow voter to continue voting, or reset ballot.
            </p>
            <p>
              <Button danger onPress={resetCardlessVoterSession}>
                Reset Ballot
              </Button>
            </p>
          </Prose>
        </Main>
      </Screen>
    );
  }

  if (pollworkerAuth.activatedCardlessVoter) {
    const { precinctId, ballotStyleId } = pollworkerAuth.activatedCardlessVoter;
    const precinct = find(election.precincts, (p) => p.id === precinctId);

    return (
      <Screen>
        <Main centerChild>
          <Prose id="audiofocus">
            <h1>
              {appPrecinct.kind === 'AllPrecincts'
                ? `Voter session activated: ${ballotStyleId} @ ${precinct.name}`
                : `Voter session activated: ${ballotStyleId}`}
            </h1>
            <ol>
              <li>Remove the poll worker card.</li>
              <li>
                Instruct the voter to press the{' '}
                <Text as="span" bold noWrap>
                  Start Voting
                </Text>{' '}
                button.
              </li>
            </ol>
            <HorizontalRule>or</HorizontalRule>
            <Text center>Deactivate this voter session to start over.</Text>
            <Text center>
              <Button small onPress={resetCardlessVoterSession}>
                Deactivate Voter Session
              </Button>
            </Text>
          </Prose>
        </Main>
      </Screen>
    );
  }

  const sidebarProps: SidebarProps = {
    appName: machineConfig.appMode.productName,
    centerContent: true,
    title: 'Poll Worker Actions',
    screenReaderInstructions:
      'To navigate through the available actions, use the down arrow.',
    footer: (
      <React.Fragment>
        <ElectionInfo
          electionDefinition={electionDefinition}
          precinctSelection={appPrecinct}
          horizontal
        />
        <VersionsData
          machineConfig={machineConfig}
          electionHash={electionDefinition.electionHash}
        />
      </React.Fragment>
    ),
  };

  if (isDiagnosticsScreenOpen) {
    return (
      <DiagnosticsScreen
        hardware={hardware}
        devices={devices}
        screenReader={screenReader}
        onBackButtonPress={() => setIsDiagnosticsScreenOpen(false)}
        sidebarProps={sidebarProps}
      />
    );
  }

  return (
    <React.Fragment>
      <Screen navLeft>
        <Main padded>
          <Prose theme={fontSizeTheme.medium} compact>
            <p>
              <strong>Polls:</strong> {getPollsStateName(pollsState)}
            </p>
            <p>
              <strong>Mode:</strong> {isLiveMode ? 'Live Election' : 'Testing'}
            </p>
          </Prose>
          <br />
          {canSelectBallotStyle && !isHidingSelectBallotStyle ? (
            <Prose compact>
              {appPrecinct.kind === 'AllPrecincts' && (
                <React.Fragment>
                  <h1>Select Precinct</h1>
                  <ButtonList data-testid="precincts">
                    {election.precincts.map((precinct) => (
                      <Button
                        fullWidth
                        key={precinct.id}
                        aria-label={`Activate Voter Session for Precinct ${precinct.name}`}
                        onPress={() =>
                          setSelectedCardlessVoterPrecinctId(precinct.id)
                        }
                        primary={
                          selectedCardlessVoterPrecinctId === precinct.id
                        }
                      >
                        {precinct.name}
                      </Button>
                    ))}
                  </ButtonList>
                </React.Fragment>
              )}
              {selectedCardlessVoterPrecinctId && (
                <React.Fragment>
                  <h1>Select Ballot Style</h1>
                  <ButtonList data-testid="ballot-styles">
                    {precinctBallotStyles.map((ballotStyle) => (
                      <Button
                        fullWidth
                        key={ballotStyle.id}
                        aria-label={`Activate Voter Session for Ballot Style ${ballotStyle.id}`}
                        onPress={() =>
                          activateCardlessVoterSession(
                            selectedCardlessVoterPrecinctId,
                            ballotStyle.id
                          )
                        }
                      >
                        {ballotStyle.id}
                      </Button>
                    ))}
                  </ButtonList>
                </React.Fragment>
              )}
              <h2>Other Actions</h2>
              <Button onPress={() => setIsHidingSelectBallotStyle(true)}>
                View Other Actions
              </Button>
            </Prose>
          ) : (
            <Prose>
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
              <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
                System Diagnostics
              </Button>
              <p>
                <Button onPress={reload}>Reset Accessible Controller</Button>
              </p>
            </Prose>
          )}
        </Main>
        <Sidebar {...sidebarProps}>
          <Prose>
            <Text center>Remove card when finished.</Text>
            {canSelectBallotStyle && isHidingSelectBallotStyle && (
              <Button onPress={() => setIsHidingSelectBallotStyle(false)} small>
                Back to Ballot Style Selection
              </Button>
            )}
          </Prose>
          <Prose>
            <br />
            <Text center>Ballots Printed:</Text>
          </Prose>
          <Prose theme={{ fontSize: '3rem' }}>
            <Text center>{ballotsPrintedCount}</Text>
          </Prose>
        </Sidebar>
        {isConfirmingEnableLiveMode && (
          <Modal
            centerContent
            content={
              <Prose textCenter id="modalaudiofocus">
                {isPrintMode ? (
                  <h1>
                    Switch to Live&nbsp;Election&nbsp;Mode and reset the tally
                    of printed ballots?
                  </h1>
                ) : (
                  <h1>Switch to Live&nbsp;Election&nbsp;Mode?</h1>
                )}
                <p>
                  Today is Election Day and this machine is in{' '}
                  <strong>Testing&nbsp;Mode.</strong>
                </p>
                <p>
                  <em>
                    Note: Switching back to Testing&nbsp;Mode requires an
                    Admin&nbsp;Card.
                  </em>
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button
                  primary
                  danger={isPrintMode}
                  onPress={confirmEnableLiveMode}
                >
                  Switch to Live&nbsp;Mode
                </Button>
                <Button onPress={cancelEnableLiveMode}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
      </Screen>
      {scannerReportData && scannerReportData.isLiveMode === isLiveMode && (
        <ScannerReportModal
          pollworkerAuth={pollworkerAuth}
          scannerReportData={scannerReportData}
          electionDefinition={electionDefinition}
          machineConfig={machineConfig}
          pollsState={pollsState}
          updatePollsState={updatePollsState}
          onClose={() => setScannerReportData(undefined)}
          logger={logger}
        />
      )}
    </React.Fragment>
  );
}
