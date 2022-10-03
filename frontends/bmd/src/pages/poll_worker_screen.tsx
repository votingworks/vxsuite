import { DateTime } from 'luxon';
import React, { useState, useEffect } from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PartyId,
  InsertedSmartcardAuth,
  PrecinctId,
  Tally,
  PrecinctSelection,
} from '@votingworks/types';
import {
  Button,
  ButtonList,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  Devices,
  fontSizeTheme,
  HorizontalRule,
  Loading,
  Main,
  Modal,
  PrecinctScannerTallyQrCode,
  PrecinctScannerTallyReport,
  PrintableContainer,
  Prose,
  Screen,
  TallyReport,
  Text,
} from '@votingworks/ui';

import {
  assert,
  TallySourceMachineType,
  find,
  readCompressedTally,
  getPrecinctSelectionName,
  getTallyIdentifier,
  Hardware,
  PrecinctScannerCardTallySchema,
  PrecinctScannerCardTally,
  singlePrecinctSelectionFor,
  sleep,
  throwIllegalValue,
} from '@votingworks/utils';

import { MachineConfig, Printer, ScreenReader } from '../config/types';

import { Sidebar, SidebarProps } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import { REPORT_PRINTING_TIMEOUT_SECONDS } from '../config/globals';
import { VersionsData } from '../components/versions_data';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';
import { DiagnosticsScreen } from './diagnostics_screen';

function parsePrecinctScannerTally(
  precinctScannerTally: PrecinctScannerCardTally,
  election: Election,
  parties: Array<PartyId | undefined>
) {
  assert(
    precinctScannerTally.tallyMachineType ===
      TallySourceMachineType.PRECINCT_SCANNER
  );
  const newSubTallies = new Map<string, Tally>();
  const precinctList = [];
  // Read the tally for each precinct and each party
  if (precinctScannerTally.talliesByPrecinct) {
    for (const [precinctId, compressedTally] of Object.entries(
      precinctScannerTally.talliesByPrecinct
    )) {
      assert(compressedTally);
      precinctList.push(singlePrecinctSelectionFor(precinctId));
      // partyId may be undefined in the case of a ballot style without a party in the election
      for (const partyId of parties) {
        const key = getTallyIdentifier(partyId, precinctId);
        const tally = readCompressedTally(
          election,
          compressedTally,
          precinctScannerTally.ballotCounts[key] ?? [0, 0],
          partyId
        );
        newSubTallies.set(key, tally);
      }
    }
  } else {
    for (const partyId of parties) {
      const key = getTallyIdentifier(
        partyId,
        precinctScannerTally.precinctSelection.kind === 'SinglePrecinct'
          ? precinctScannerTally.precinctSelection.precinctId
          : undefined
      );
      const tally = readCompressedTally(
        election,
        precinctScannerTally.tally,
        precinctScannerTally.ballotCounts[key] ?? [0, 0],
        partyId
      );
      newSubTallies.set(key, tally);
    }
    precinctList.push(precinctScannerTally.precinctSelection);
  }
  return {
    overallTally: precinctScannerTally.tally,
    subTallies: newSubTallies,
    precinctList,
  };
}

type PrecinctScannerTallyReportModalState = 'initial' | 'printing' | 'reprint';

function PrecinctScannerTallyReportModal({
  electionDefinition,
  precinctScannerTally,
  pollworkerAuth,
  printer,
  machineConfig,
  isPollsOpen,
  togglePollsOpen,
  onClose,
}: {
  electionDefinition: ElectionDefinition;
  precinctScannerTally: PrecinctScannerCardTally;
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn;
  printer: Printer;
  machineConfig: MachineConfig;
  isPollsOpen: boolean;
  togglePollsOpen: VoidFunction;
  onClose: VoidFunction;
}) {
  const [modalState, setModalState] =
    useState<PrecinctScannerTallyReportModalState>('initial');

  const parties = getPartyIdsInBallotStyles(electionDefinition.election);
  const precinctScannerTallyInformation =
    precinctScannerTally &&
    parsePrecinctScannerTally(
      precinctScannerTally,
      electionDefinition.election,
      parties
    );

  function togglePollsToMatchReport() {
    if (
      precinctScannerTally &&
      precinctScannerTally.isPollsOpen !== isPollsOpen
    ) {
      togglePollsOpen();
    }
  }

  async function togglePollsAndPrintReports() {
    setModalState('printing');
    try {
      await printer.print({
        sides: 'one-sided',
        copies: DEFAULT_NUMBER_POLL_REPORT_COPIES,
      });
      await sleep(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
      await pollworkerAuth.card.clearStoredData();
      togglePollsToMatchReport();
    } finally {
      setModalState('reprint');
    }
  }

  async function printAdditionalReport() {
    setModalState('printing');
    try {
      await printer.print({
        sides: 'one-sided',
      });
      await sleep(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
    } finally {
      setModalState('reprint');
    }
  }

  const currentTime = Date.now();

  assert(precinctScannerTallyInformation);

  let modalContent: React.ReactNode = null;
  let modalActions: React.ReactNode = null;

  switch (modalState) {
    case 'initial':
      modalContent = (
        <Prose id="modalaudiofocus">
          {precinctScannerTally.isPollsOpen ? (
            <React.Fragment>
              <h1>Polls Opened Report on Card</h1>
              <p>
                This poll worker card contains a polls opened report. After
                printing, the report will be cleared from the card and the polls
                will be opened on VxMark.
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1>Polls Closed Report on Card</h1>
              <p>
                This poll worker card contains a polls closed report. After
                printing, the report will be cleared from the card and the polls
                will be closed on VxMark.
              </p>
            </React.Fragment>
          )}
        </Prose>
      );
      modalActions = (
        <Button primary onPress={togglePollsAndPrintReports}>
          {precinctScannerTally.isPollsOpen
            ? 'Open Polls and Print Report'
            : 'Close Polls and Print Report'}
        </Button>
      );
      break;
    case 'printing':
      modalContent = (
        <Prose textCenter id="modalaudiofocus">
          <Loading>
            {precinctScannerTally.isPollsOpen
              ? 'Printing polls opened report'
              : 'Printing polls closed report'}
          </Loading>
        </Prose>
      );
      break;
    case 'reprint':
      modalContent = (
        <Prose id="modalaudiofocus">
          {precinctScannerTally.isPollsOpen ? (
            <React.Fragment>
              <h1>Polls Opened Report Printed</h1>
              <p>
                The polls are now open. If needed, you may print additional
                copies of the polls opened report.
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1>Polls Closed Report Printed</h1>
              <p>
                The polls are now closed. If needed, you may print additional
                copies of the polls closed report.
              </p>
            </React.Fragment>
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
    <React.Fragment>
      <Modal
        // This modal is torn down in some way which react-modal doesn't expect
        // and as a result, can leave the app hidden from the accessibility
        // tree. We set this prop to false to disable hiding the app.
        // https://github.com/votingworks/vxsuite/issues/2618
        ariaHideApp={false}
        content={modalContent}
        actions={modalActions}
      />
      <PrintableContainer>
        <TallyReport>
          {precinctScannerTallyInformation.precinctList.map((precinctSel) =>
            parties.map((partyId) => {
              const precinctIdIfDefined =
                precinctSel.kind === 'SinglePrecinct'
                  ? precinctSel.precinctId
                  : undefined;
              const tallyForReport =
                precinctScannerTallyInformation.subTallies.get(
                  getTallyIdentifier(partyId, precinctIdIfDefined)
                );
              assert(tallyForReport);
              return (
                <PrecinctScannerTallyReport
                  key={getTallyIdentifier(partyId, precinctIdIfDefined)}
                  electionDefinition={electionDefinition}
                  tally={tallyForReport}
                  precinctSelection={precinctSel}
                  partyId={partyId}
                  isPollsOpen={precinctScannerTally.isPollsOpen}
                  isLiveMode={precinctScannerTally.isLiveMode}
                  pollsToggledTime={precinctScannerTally.timePollsToggled}
                  currentTime={currentTime}
                  precinctScannerMachineId={precinctScannerTally.machineId}
                />
              );
            })
          )}
          {electionDefinition.election.quickResultsReportingUrl &&
            precinctScannerTally.totalBallotsScanned > 0 && (
              <PrecinctScannerTallyQrCode
                electionDefinition={electionDefinition}
                signingMachineId={machineConfig.machineId}
                compressedTally={precinctScannerTallyInformation.overallTally}
                isPollsOpen={precinctScannerTally.isPollsOpen}
                isLiveMode={precinctScannerTally.isLiveMode}
                pollsToggledTime={precinctScannerTally.timePollsToggled}
              />
            )}
        </TallyReport>
      </PrintableContainer>
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
  isPollsOpen: boolean;
  ballotsPrintedCount: number;
  machineConfig: MachineConfig;
  hardware: Hardware;
  devices: Devices;
  screenReader: ScreenReader;
  printer: Printer;
  togglePollsOpen: () => void;
  reload: () => void;
}

export function PollWorkerScreen({
  pollworkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,
  electionDefinition,
  enableLiveMode,
  isLiveMode,
  isPollsOpen,
  ballotsPrintedCount,
  machineConfig,
  hardware,
  devices,
  screenReader,
  printer,
  togglePollsOpen,
  hasVotes,
  reload,
}: PollworkerScreenProps): JSX.Element {
  const { election } = electionDefinition;
  const electionDate = DateTime.fromISO(electionDefinition.election.date);
  const isElectionDay = electionDate.hasSame(DateTime.now(), 'day');
  const precinctName = getPrecinctSelectionName(
    election.precincts,
    appPrecinct
  );

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === 'SinglePrecinct' ? appPrecinct.precinctId : undefined
    );
  const [isShowingVxScanPollsOpenModal, setIsShowingVxScanPollsOpenModal] =
    useState(false);

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
  const [precinctScannerTally, setPrecinctScannerTally] =
    useState<PrecinctScannerCardTally>();
  useEffect(() => {
    if (precinctScannerTally) return;
    if (!pollworkerAuth.card.hasStoredData) return;
    async function loadTallyFromCard() {
      setPrecinctScannerTally(
        (
          await pollworkerAuth.card.readStoredObject(
            PrecinctScannerCardTallySchema
          )
        ).ok()
      );
    }
    void loadTallyFromCard();
  }, [pollworkerAuth, precinctScannerTally]);

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (!isConfirmingEnableLiveMode && !precinctScannerTally) {
      triggerAudioFocus();
    }
  }, [isConfirmingEnableLiveMode, precinctScannerTally]);

  const isPrintMode = machineConfig.appMode.isPrint;
  const isMarkAndPrintMode =
    machineConfig.appMode.isPrint && machineConfig.appMode.isMark;

  const canSelectBallotStyle = isMarkAndPrintMode && isPollsOpen;
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
              <strong>Polls:</strong> {isPollsOpen ? 'Open' : 'Closed'}
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
                <Button onPress={() => setIsShowingVxScanPollsOpenModal(true)}>
                  {isPollsOpen
                    ? `Close Polls for ${precinctName}`
                    : `Open Polls for ${precinctName}`}
                </Button>
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
        {isShowingVxScanPollsOpenModal && (
          <Modal
            centerContent
            content={
              <Prose textCenter id="modalaudiofocus">
                {isPollsOpen ? (
                  <React.Fragment>
                    <h1>No Polls Closed Report on Card</h1>
                    <p>
                      Close polls on VxScan to save the polls closed report
                      before closing polls on VxMark.
                    </p>
                  </React.Fragment>
                ) : (
                  <React.Fragment>
                    <h1>No Polls Opened Report on Card</h1>
                    <p>
                      Open polls on VxScan to save the polls opened report
                      before opening polls on VxMark.
                    </p>
                  </React.Fragment>
                )}
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button
                  primary
                  onPress={() => setIsShowingVxScanPollsOpenModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onPress={() => {
                    togglePollsOpen();
                    setIsShowingVxScanPollsOpenModal(false);
                  }}
                >
                  {isPollsOpen ? 'Close VxMark Now' : 'Open VxMark Now'}
                </Button>
              </React.Fragment>
            }
          />
        )}
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
      {precinctScannerTally && (
        <PrecinctScannerTallyReportModal
          pollworkerAuth={pollworkerAuth}
          precinctScannerTally={precinctScannerTally}
          electionDefinition={electionDefinition}
          machineConfig={machineConfig}
          printer={printer}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
          onClose={() => setPrecinctScannerTally(undefined)}
        />
      )}
    </React.Fragment>
  );
}
