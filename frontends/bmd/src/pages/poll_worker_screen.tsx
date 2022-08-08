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
} from '@votingworks/types';
import {
  Button,
  ButtonList,
  Devices,
  HorizontalRule,
  Loading,
  Main,
  Modal,
  PrecinctScannerPollsReport,
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
  getTallyIdentifier,
  Hardware,
  PrecinctScannerCardTallySchema,
  PrecinctScannerCardTally,
  sleep,
} from '@votingworks/utils';

import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
  Printer,
  ScreenReader,
} from '../config/types';

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
      precinctList.push({
        kind: PrecinctSelectionKind.SinglePrecinct,
        precinctId,
      });
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
        precinctScannerTally.precinctSelection.kind ===
          PrecinctSelectionKind.SinglePrecinct
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

function PrecinctScannerTallyReportModal({
  electionDefinition,
  pollworkerAuth,
  printer,
  machineConfig,
  isPollsOpen,
  togglePollsOpen,
}: {
  electionDefinition: ElectionDefinition;
  pollworkerAuth: InsertedSmartcardAuth.PollWorkerLoggedIn;
  printer: Printer;
  machineConfig: MachineConfig;
  isPollsOpen: boolean;
  togglePollsOpen: () => void;
}) {
  const [precinctScannerTally, setPrecinctScannerTally] =
    useState<PrecinctScannerCardTally>();
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    async function loadTallyFromCard() {
      if (precinctScannerTally) return;
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

  async function printReportAndTogglePolls() {
    setIsPrinting(true);
    try {
      await printer.print({ sides: 'one-sided' });
      await sleep(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
      await pollworkerAuth.card.clearStoredData();
      togglePollsToMatchReport();
    } finally {
      setIsPrinting(false);
      setPrecinctScannerTally(undefined);
    }
  }

  const currentTime = Date.now();
  const reportPurposes = ['Publicly Posted', 'Officially Filed'];

  if (!precinctScannerTally) return null;
  assert(precinctScannerTallyInformation);

  return (
    <React.Fragment>
      {!isPrinting && (
        <Modal
          content={
            <Prose id="modalaudiofocus">
              {precinctScannerTally.isPollsOpen ? (
                <React.Fragment>
                  <h1>Polls Opened Report on Card</h1>
                  <p>
                    This poll worker card contains a polls opened report. After
                    printing, the report will be cleared from the card and the
                    polls will be opened on VxMark.
                  </p>
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <h1>Polls Closed Report on Card</h1>
                  <p>
                    This poll worker card contains a polls closed report. After
                    printing, the report will be cleared from the card and the
                    polls will be closed on VxMark.
                  </p>
                </React.Fragment>
              )}
            </Prose>
          }
          actions={
            <Button primary onPress={printReportAndTogglePolls}>
              {precinctScannerTally.isPollsOpen
                ? 'Open Polls and Print Report'
                : 'Close Polls and Print Report'}
            </Button>
          }
        />
      )}
      {isPrinting && (
        <Modal
          content={
            <Prose textCenter id="modalaudiofocus">
              <Loading>
                {precinctScannerTally.isPollsOpen
                  ? 'Printing polls opened report'
                  : 'Printing polls closed report'}
              </Loading>
            </Prose>
          }
        />
      )}
      {reportPurposes.map((reportPurpose) => {
        return (
          <React.Fragment key={reportPurpose}>
            <PrecinctScannerPollsReport
              key={`polls-report-${reportPurpose}`}
              ballotCount={precinctScannerTally.totalBallotsScanned}
              currentTime={currentTime}
              election={electionDefinition.election}
              isLiveMode={precinctScannerTally.isLiveMode}
              isPollsOpen={precinctScannerTally.isPollsOpen}
              precinctScannerMachineId={precinctScannerTally.machineId}
              timeTallySaved={precinctScannerTally.timeSaved}
              precinctSelection={precinctScannerTally.precinctSelection}
              reportPurpose={reportPurpose}
            />
            <PrintableContainer>
              <TallyReport>
                {precinctScannerTallyInformation.precinctList.map(
                  (precinctSel) =>
                    parties.map((partyId) => {
                      const precinctIdIfDefined =
                        precinctSel.kind ===
                        PrecinctSelectionKind.SinglePrecinct
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
                          reportPurpose={reportPurpose}
                          isPollsOpen={precinctScannerTally.isPollsOpen}
                          reportSavedTime={precinctScannerTally.timeSaved}
                        />
                      );
                    })
                )}
                {electionDefinition.election.quickResultsReportingUrl &&
                  precinctScannerTally.totalBallotsScanned > 0 && (
                    <PrecinctScannerTallyQrCode
                      electionDefinition={electionDefinition}
                      signingMachineId={machineConfig.machineId}
                      compressedTally={
                        precinctScannerTallyInformation.overallTally
                      }
                      reportPurpose={reportPurpose}
                      isPollsOpen={precinctScannerTally.isPollsOpen}
                      isLiveMode={precinctScannerTally.isLiveMode}
                      reportSavedTime={precinctScannerTally.timeSaved}
                    />
                  )}
              </TallyReport>
            </PrintableContainer>
          </React.Fragment>
        );
      })}
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
  const precinctName =
    appPrecinct.kind === PrecinctSelectionKind.AllPrecincts
      ? 'All Precincts'
      : find(election.precincts, (p) => p.id === appPrecinct.precinctId).name;

  const [selectedCardlessVoterPrecinctId, setSelectedCardlessVoterPrecinctId] =
    useState<PrecinctId | undefined>(
      appPrecinct.kind === PrecinctSelectionKind.SinglePrecinct
        ? appPrecinct.precinctId
        : undefined
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
  const pollworkerCardHasTally = pollworkerAuth.card.hasStoredData;

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (!isConfirmingEnableLiveMode && !pollworkerCardHasTally) {
      triggerAudioFocus();
    }
  }, [isConfirmingEnableLiveMode, pollworkerCardHasTally]);

  const isPrintMode = machineConfig.appMode.isPrint;
  const isMarkAndPrintMode =
    machineConfig.appMode.isPrint && machineConfig.appMode.isMark;

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
              {appPrecinct.kind === PrecinctSelectionKind.AllPrecincts
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
          {isMarkAndPrintMode && isPollsOpen && (
            <React.Fragment>
              <Prose>
                <h1>Activate Voter Session</h1>
              </Prose>
              {appPrecinct.kind === PrecinctSelectionKind.AllPrecincts && (
                <React.Fragment>
                  <h3>Choose Precinct</h3>
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
                  <h3>Choose Ballot Style</h3>
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
            </React.Fragment>
          )}
          <Prose>
            <h1>Open/Close Polls</h1>
            <Text warningIcon={!isPollsOpen} voteIcon={isPollsOpen}>
              {isPollsOpen
                ? 'Polls are currently open.'
                : 'Polls are currently closed.'}{' '}
              {isLiveMode ? (
                <React.Fragment>
                  Machine is in Live&nbsp;Election&nbsp;Mode.
                </React.Fragment>
              ) : (
                <React.Fragment>
                  Machine is in Testing&nbsp;Mode.
                </React.Fragment>
              )}
            </Text>
            <p>
              <Button
                primary
                large
                onPress={() => setIsShowingVxScanPollsOpenModal(true)}
              >
                {isPollsOpen
                  ? `Close Polls for ${precinctName}`
                  : `Open Polls for ${precinctName}`}
              </Button>
            </p>

            <h1>Advanced</h1>
            <Button onPress={() => setIsDiagnosticsScreenOpen(true)}>
              System Diagnostics
            </Button>
            <p>
              <Button onPress={reload}>Reset Accessible Controller</Button>
            </p>
          </Prose>
        </Main>
        <Sidebar {...sidebarProps}>
          <Prose>
            <Text center>Remove card when finished.</Text>
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
      {pollworkerCardHasTally && (
        <PrecinctScannerTallyReportModal
          pollworkerAuth={pollworkerAuth}
          electionDefinition={electionDefinition}
          machineConfig={machineConfig}
          printer={printer}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
        />
      )}
    </React.Fragment>
  );
}
