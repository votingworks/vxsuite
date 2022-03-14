import { DateTime } from 'luxon';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useInterval from '@rooks/use-interval';

import {
  BallotStyleId,
  CompressedTally,
  ElectionDefinition,
  getPartyIdsInBallotStyles,
  PrecinctId,
  Tally,
} from '@votingworks/types';
import {
  Button,
  ButtonList,
  HorizontalRule,
  Loading,
  Main,
  MainChild,
  PrecinctScannerTallyReport,
  PrecinctScannerPollsReport,
  PrecinctScannerTallyQrCode,
  PrintableContainer,
  TallyReport,
  Modal,
} from '@votingworks/ui';

import {
  assert,
  TallySourceMachineType,
  find,
  readCompressedTally,
  PrecinctScannerCardTally,
  getTallyIdentifier,
} from '@votingworks/utils';

import {
  MachineConfig,
  PrecinctSelection,
  PrecinctSelectionKind,
  Printer,
} from '../config/types';

import { Prose } from '../components/prose';
import { Screen } from '../components/screen';
import { Text } from '../components/text';
import { Sidebar } from '../components/sidebar';
import { ElectionInfo } from '../components/election_info';
import {
  REPORT_PRINTING_TIMEOUT_SECONDS,
  POLLING_INTERVAL_FOR_TOTP,
} from '../config/globals';
import { VersionsData } from '../components/versions_data';
import { triggerAudioFocus } from '../utils/trigger_audio_focus';

interface Props {
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
  printer: Printer;
  togglePollsOpen: () => void;
  tallyOnCard?: PrecinctScannerCardTally;
  clearTalliesOnCard: () => Promise<void>;
  reload: () => void;
}

interface DerivedTallyInformationFromCard {
  subTallies: Map<string, Tally>;
  overallTally: CompressedTally;
  precinctList: PrecinctSelection[];
}

export function PollWorkerScreen({
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
  printer,
  togglePollsOpen,
  hasVotes,
  tallyOnCard,
  clearTalliesOnCard,
  reload,
}: Props): JSX.Element {
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
  ] = useState(tallyOnCard !== undefined);
  const [
    isPrintingPrecinctScannerReport,
    setIsPrintingPrecinctScannerReport,
  ] = useState(false);
  const [systemAuthenticationCode, setSystemAuthenticationCode] = useState(
    '---·---'
  );

  const parties = useMemo(() => getPartyIdsInBallotStyles(election), [
    election,
  ]);
  const [
    precinctScannerTallyInformation,
    setPrecinctScannerTallyInformation,
  ] = useState<DerivedTallyInformationFromCard>();

  useEffect(() => {
    if (tallyOnCard) {
      assert(
        tallyOnCard &&
          tallyOnCard.tallyMachineType ===
            TallySourceMachineType.PRECINCT_SCANNER
      );
      const newSubTallies = new Map<string, Tally>();
      const precinctList = [];
      // Read the tally for each precinct and each party
      if (tallyOnCard.talliesByPrecinct) {
        for (const [precinctId, compressedTally] of Object.entries(
          tallyOnCard.talliesByPrecinct
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
              tallyOnCard.ballotCounts[key] ?? [0, 0],
              partyId
            );
            newSubTallies.set(key, tally);
          }
        }
      } else {
        for (const partyId of parties) {
          const key = getTallyIdentifier(
            partyId,
            tallyOnCard.precinctSelection.kind ===
              PrecinctSelectionKind.SinglePrecinct
              ? tallyOnCard.precinctSelection.precinctId
              : undefined
          );
          const tally = readCompressedTally(
            election,
            tallyOnCard.tally,
            tallyOnCard.ballotCounts[key] ?? [0, 0],
            partyId
          );
          newSubTallies.set(key, tally);
        }
        precinctList.push(tallyOnCard.precinctSelection);
      }
      setPrecinctScannerTallyInformation({
        overallTally: tallyOnCard.tally,
        subTallies: newSubTallies,
        precinctList,
      });
    }
  }, [election, tallyOnCard, parties]);

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

  useInterval(
    async () => {
      const totpResult = await window.kiosk?.totp?.get();
      if (totpResult) {
        const codeChunks = totpResult.code.match(/.{1,3}/g);
        if (codeChunks) setSystemAuthenticationCode(codeChunks.join('·'));
      }
    },
    POLLING_INTERVAL_FOR_TOTP,
    true
  );

  const isPrintMode = machineConfig.appMode.isPrint;
  const isMarkAndPrintMode =
    machineConfig.appMode.isPrint && machineConfig.appMode.isMark;

  function requestPrintPrecinctScannerReport() {
    setIsPrintingPrecinctScannerReport(true);
    setIsConfirmingPrecinctScannerPrint(false);
  }

  const resetCardTallyData = useCallback(async () => {
    await clearTalliesOnCard();
    setIsPrintingPrecinctScannerReport(false);
  }, [clearTalliesOnCard]);

  function confirmEnableLiveMode() {
    enableLiveMode();
    setIsConfirmingEnableLiveMode(false);
  }

  useEffect(() => {
    let isPrinting = false;
    async function printReport() {
      if (!isPrinting && isPrintingPrecinctScannerReport) {
        await printer.print({ sides: 'one-sided' });
        window.setTimeout(async () => {
          await resetCardTallyData();
        }, REPORT_PRINTING_TIMEOUT_SECONDS * 1000);
      }
    }
    void printReport();
    return () => {
      isPrinting = true;
    };
  }, [
    isPrintingPrecinctScannerReport,
    printer,
    togglePollsOpen,
    resetCardTallyData,
  ]);

  const currentTime = Date.now();
  const reportPurposes = ['Publicly Posted', 'Officially Filed'];

  if (hasVotes && cardlessVoterSessionBallotStyleId) {
    return (
      <Screen>
        <Main>
          <MainChild center narrow>
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
          </MainChild>
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
        <Main>
          <MainChild center narrow>
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
          </MainChild>
        </Main>
      </Screen>
    );
  }

  return (
    <React.Fragment>
      <Screen flexDirection="row-reverse" voterMode={false}>
        <Main padded>
          <MainChild>
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
                          primary={
                            cardlessVoterSessionPrecinctId === precinct.id
                          }
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
              <Button onPress={reload}>Reset Accessible Controller</Button>
            </Prose>
          </MainChild>
        </Main>
        <Sidebar
          appName={machineConfig.appMode.productName}
          centerContent
          title="Poll Worker Actions"
          screenReaderInstructions="To navigate through the available actions, use the down arrow."
          footer={
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
          }
        >
          <Prose>
            <Text center>Remove card when finished.</Text>

            <Text center>
              System Authentication Code: {systemAuthenticationCode}
            </Text>
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
        {isConfirmingPrecinctScannerPrint && !precinctScannerTallyInformation && (
          <Modal
            ariaHideApp={false}
            content={
              <Prose textCenter id="modalaudiofocus">
                <Loading />
              </Prose>
            }
          />
        )}
        {isConfirmingPrecinctScannerPrint && precinctScannerTallyInformation && (
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
      {tallyOnCard &&
        precinctScannerTallyInformation &&
        reportPurposes.map((reportPurpose) => {
          return (
            <React.Fragment key={reportPurpose}>
              <PrecinctScannerPollsReport
                key={`polls-report-${reportPurpose}`}
                ballotCount={tallyOnCard.totalBallotsScanned}
                currentTime={currentTime}
                election={election}
                isLiveMode={tallyOnCard.isLiveMode}
                isPollsOpen={tallyOnCard.isPollsOpen}
                precinctScannerMachineId={tallyOnCard.machineId}
                timeTallySaved={tallyOnCard.timeSaved}
                precinctSelection={tallyOnCard.precinctSelection}
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
                        const tallyForReport = precinctScannerTallyInformation.subTallies.get(
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
                            isPollsOpen={tallyOnCard.isPollsOpen}
                            reportSavedTime={tallyOnCard.timeSaved}
                          />
                        );
                      })
                  )}
                  {tallyOnCard.totalBallotsScanned > 0 && (
                    <PrecinctScannerTallyQrCode
                      electionDefinition={electionDefinition}
                      signingMachineId={machineConfig.machineId}
                      compressedTally={
                        precinctScannerTallyInformation.overallTally
                      }
                      reportPurpose={reportPurpose}
                      isPollsOpen={tallyOnCard.isPollsOpen}
                      isLiveMode={tallyOnCard.isLiveMode}
                      reportSavedTime={tallyOnCard.timeSaved}
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
