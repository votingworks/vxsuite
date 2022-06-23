import { DateTime } from 'luxon';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import {
  BallotStyleId,
  Election,
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PartyId,
  PollworkerLoggedInAuth,
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
  useLock,
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

export interface PollworkerScreenProps {
  pollworkerAuth: PollworkerLoggedInAuth;
  activateCardlessVoterSession: (
    precinctId: PrecinctId,
    ballotStyleId?: BallotStyleId
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

export function PollWorkerScreen({
  pollworkerAuth,
  activateCardlessVoterSession,
  resetCardlessVoterSession,
  appPrecinct,

  cardlessVoterSessionPrecinctId = appPrecinct.kind ===
  PrecinctSelectionKind.SinglePrecinct
    ? appPrecinct.precinctId
    : undefined,

  cardlessVoterSessionBallotStyleId,
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

  const precinctBallotStyles = cardlessVoterSessionPrecinctId
    ? election.ballotStyles.filter((bs) =>
        bs.precincts.includes(cardlessVoterSessionPrecinctId)
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

  const [
    isConfirmingPrecinctScannerPrint,
    setIsConfirmingPrecinctScannerPrint,
  ] = useState(false);
  const [isPrintingPrecinctScannerReport, setIsPrintingPrecinctScannerReport] =
    useState(false);

  const [isDiagnosticsScreenOpen, setIsDiagnosticsScreenOpen] = useState(false);

  const parties = useMemo(
    () => getPartyIdsInBallotStyles(election),
    [election]
  );
  const [precinctScannerTally, setPrecinctScannerTally] =
    useState<PrecinctScannerCardTally>();

  useEffect(() => {
    async function checkCardForTally() {
      if (!pollworkerAuth.card.hasStoredData) return;
      const tally = (
        await pollworkerAuth.card.readStoredObject(
          PrecinctScannerCardTallySchema
        )
      ).ok();
      if (tally) {
        setPrecinctScannerTally(tally);
        setIsConfirmingPrecinctScannerPrint(true);
      }
    }

    if (!precinctScannerTally) {
      void checkCardForTally();
    }
  }, [pollworkerAuth, election, parties, precinctScannerTally]);

  const precinctScannerTallyInformation =
    precinctScannerTally &&
    parsePrecinctScannerTally(precinctScannerTally, election, parties);

  /*
   * Trigger audiofocus for the PollWorker screen landing page. This occurs when
   * the component first renders, or any of the modals in the page are closed. If you
   * add a new modal to this component add it's state parameter as a dependency here.
   */
  useEffect(() => {
    if (
      !isConfirmingPrecinctScannerPrint &&
      !isPrintingPrecinctScannerReport &&
      !isConfirmingEnableLiveMode
    ) {
      triggerAudioFocus();
    }
  }, [
    cardlessVoterSessionBallotStyleId,
    isConfirmingPrecinctScannerPrint,
    isPrintingPrecinctScannerReport,
    isConfirmingEnableLiveMode,
  ]);

  const isPrintMode = machineConfig.appMode.isPrint;
  const isMarkAndPrintMode =
    machineConfig.appMode.isPrint && machineConfig.appMode.isMark;

  function requestPrintPrecinctScannerReport() {
    setIsPrintingPrecinctScannerReport(true);
    setIsConfirmingPrecinctScannerPrint(false);
  }

  const resetCardTallyData = useCallback(async () => {
    await pollworkerAuth.card.clearStoredData();
    setIsPrintingPrecinctScannerReport(false);
  }, [pollworkerAuth]);

  function confirmEnableLiveMode() {
    enableLiveMode();
    setIsConfirmingEnableLiveMode(false);
  }

  const printLock = useLock();
  useEffect(() => {
    async function printReport() {
      if (isPrintingPrecinctScannerReport && printLock.lock()) {
        await printer.print({ sides: 'one-sided' });
        await sleep(REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
        await resetCardTallyData();
        setPrecinctScannerTally(undefined);
        printLock.unlock();
      }
    }
    void printReport();
  }, [
    isPrintingPrecinctScannerReport,
    printer,
    togglePollsOpen,
    resetCardTallyData,
    printLock,
  ]);

  const currentTime = Date.now();
  const reportPurposes = ['Publicly Posted', 'Officially Filed'];

  if (hasVotes && cardlessVoterSessionBallotStyleId) {
    return (
      <Screen>
        <Main centerChild>
          <Prose textCenter>
            <h1
              aria-label={`Ballot style ${cardlessVoterSessionBallotStyleId} has been activated.`}
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

  if (cardlessVoterSessionPrecinctId && cardlessVoterSessionBallotStyleId) {
    const activationPrecinctName = find(
      election.precincts,
      (p) => p.id === cardlessVoterSessionPrecinctId
    ).name;

    return (
      <Screen>
        <Main centerChild>
          <Prose id="audiofocus">
            <h1>
              {appPrecinct.kind === PrecinctSelectionKind.AllPrecincts
                ? `Voter session activated: ${cardlessVoterSessionBallotStyleId} @ ${activationPrecinctName}`
                : `Voter session activated: ${cardlessVoterSessionBallotStyleId}`}
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
                          activateCardlessVoterSession(precinct.id)
                        }
                        primary={cardlessVoterSessionPrecinctId === precinct.id}
                      >
                        {precinct.name}
                      </Button>
                    ))}
                  </ButtonList>
                </React.Fragment>
              )}
              {cardlessVoterSessionPrecinctId && (
                <React.Fragment>
                  <h3>Choose Ballot Style</h3>
                  <ButtonList data-testid="ballot-styles">
                    {precinctBallotStyles.map((bs) => (
                      <Button
                        fullWidth
                        key={bs.id}
                        aria-label={`Activate Voter Session for Ballot Style ${bs.id}`}
                        onPress={() =>
                          activateCardlessVoterSession(
                            cardlessVoterSessionPrecinctId,
                            bs.id
                          )
                        }
                      >
                        {bs.id}
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
              <Button primary large onPress={togglePollsOpen}>
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
        {isPrintingPrecinctScannerReport && (
          <Modal
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading>Printing tally report</Loading>
              </Prose>
            }
          />
        )}
        {isConfirmingPrecinctScannerPrint && (
          <Modal
            content={
              <Prose id="modalaudiofocus">
                <h1>Tally Report on Card</h1>
                <p>
                  This poll worker card contains a tally report. The report will
                  be cleared from the card after being printed.
                </p>
              </Prose>
            }
            actions={
              <React.Fragment>
                <Button primary onPress={requestPrintPrecinctScannerReport}>
                  Print Tally Report
                </Button>
              </React.Fragment>
            }
          />
        )}
      </Screen>
      {precinctScannerTally &&
        precinctScannerTallyInformation &&
        reportPurposes.map((reportPurpose) => {
          return (
            <React.Fragment key={reportPurpose}>
              <PrecinctScannerPollsReport
                key={`polls-report-${reportPurpose}`}
                ballotCount={precinctScannerTally.totalBallotsScanned}
                currentTime={currentTime}
                election={election}
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
                            key={getTallyIdentifier(
                              partyId,
                              precinctIdIfDefined
                            )}
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
                  {precinctScannerTally.totalBallotsScanned > 0 && (
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
