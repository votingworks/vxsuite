import React, { useContext, useEffect, useState, useMemo } from 'react';
import makeDebug from 'debug';
import useInterval from '@rooks/use-interval';

import {
  Button,
  Prose,
  Loading,
  Modal,
  PrecinctScannerPollsReport,
  PrecinctScannerTallyReport,
  PrecinctScannerTallyQrCode,
  PrintableContainer,
  TallyReport,
  UsbDrive,
} from '@votingworks/ui';
import {
  assert,
  BallotCountDetails,
  compressTally,
  computeTallyWithPrecomputedCategories,
  filterTalliesByParams,
  format,
  getTallyIdentifier,
  PrecinctScannerCardTally,
  Printer,
  TallySourceMachineType,
} from '@votingworks/utils';
import {
  CastVoteRecord,
  VotingMethod,
  PrecinctSelection,
  PrecinctSelectionKind,
  TallyCategory,
  FullElectionTally,
  Tally,
  Dictionary,
  CompressedTally,
  getPartyIdsInBallotStyles,
} from '@votingworks/types';
import pluralize from 'pluralize';
import { POLLING_INTERVAL_FOR_TOTP } from '../config/globals';
import { CenteredLargeProse, CenteredScreen } from '../components/layout';
import { Absolute } from '../components/absolute';
import { Bar } from '../components/bar';
import { ExportResultsModal } from '../components/export_results_modal';

import { AppContext } from '../contexts/app_context';

enum PollWorkerFlowState {
  INIT = 'init',
  POLLS_OPENED_COMPLETE = 'opened polls complete',
  POLLS_CLOSED_NEEDS_EXPORT = 'polls closed needs export',
  POLLS_CLOSED_COMPLETE = 'polls closed complete',
}

function SaveAndPrintReportInstructions({ title }: { title: string }) {
  return (
    <Prose>
      <h1>{title}</h1>
      <p>The report will be saved on the poll worker card.</p>
      <p>
        Insert the card into a VxMark to <strong>print the report</strong>.
      </p>
    </Prose>
  );
}

function PrintReportInstructions({
  title,
  count,
}: {
  title: string;
  count: number;
}) {
  return (
    <Prose>
      <h1>{title}</h1>
      <p>A total of {pluralize('report', count, true)} will be printed.</p>
    </Prose>
  );
}

const debug = makeDebug('precinct-scanner:pollworker-screen');
const reportPurposes = ['Publicly Posted', 'Officially Filed'];

interface Props {
  scannedBallotCount: number;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  togglePollsOpen: () => void;
  getCvrsFromExport: () => Promise<CastVoteRecord[]>;
  saveTallyToCard: (cardTally: PrecinctScannerCardTally) => Promise<boolean>;
  printer: Printer;
  hasPrinterAttached: boolean;
  usbDrive: UsbDrive;
}

export function PollWorkerScreen({
  scannedBallotCount,
  isPollsOpen,
  togglePollsOpen,
  getCvrsFromExport,
  saveTallyToCard,
  isLiveMode,
  hasPrinterAttached: printerFromProps,
  printer,
  usbDrive,
}: Props): JSX.Element {
  const { electionDefinition, currentPrecinctId, machineConfig } = useContext(
    AppContext
  );
  assert(electionDefinition);
  const [isHandlingTallyReport, setIsHandlingTallyReport] = useState(false);
  const [currentTally, setCurrentTally] = useState<FullElectionTally>();
  const [currentSubTallies, setCurrentSubTallies] = useState<
    ReadonlyMap<string, Tally>
  >(new Map());
  const [systemAuthenticationCode, setSystemAuthenticationCode] = useState(
    '---·---'
  );
  const [isExportingResults, setIsExportingResults] = useState(false);
  const hasPrinterAttached = printerFromProps || !window.kiosk;
  const { election } = electionDefinition;

  const precinct = election.precincts.find((p) => p.id === currentPrecinctId);
  const precinctSelection: PrecinctSelection = useMemo(
    () =>
      precinct === undefined
        ? { kind: PrecinctSelectionKind.AllPrecincts }
        : {
            kind: PrecinctSelectionKind.SinglePrecinct,
            precinctId: precinct.id,
          },
    [precinct]
  );

  const currentCompressedTally = useMemo(
    () => currentTally && compressTally(election, currentTally.overallTally),
    [election, currentTally]
  );

  const precinctList = useMemo(
    () =>
      precinctSelection.kind === PrecinctSelectionKind.AllPrecincts
        ? election.precincts.map(({ id }) => id)
        : [precinctSelection.precinctId],
    [precinctSelection, election.precincts]
  );

  const parties = useMemo(() => getPartyIdsInBallotStyles(election), [
    election,
  ]);

  useEffect(() => {
    async function calculateTally() {
      const castVoteRecords = await getCvrsFromExport();
      const tally = computeTallyWithPrecomputedCategories(
        election,
        new Set(castVoteRecords),
        [TallyCategory.Party, TallyCategory.Precinct]
      );
      // Get all tallies by precinct and party
      const newSubTallies = new Map();
      for (const partyId of parties) {
        for (const precinctId of precinctList) {
          const filteredTally = filterTalliesByParams(tally, election, {
            precinctId,
            partyId,
          });
          newSubTallies.set(
            getTallyIdentifier(partyId, precinctId),
            filteredTally
          );
        }
      }
      setCurrentSubTallies(newSubTallies);
      if (castVoteRecords.length !== scannedBallotCount) {
        debug(
          `Warning, ballots scanned count from status endpoint (${scannedBallotCount}) does not match number of CVRs (${castVoteRecords.length}) `
        );
      }
      if (
        tally.overallTally.numberOfBallotsCounted !== castVoteRecords.length
      ) {
        debug(
          `Warning, ballot count from calculated tally (${tally.overallTally.numberOfBallotsCounted}) does not match number of CVRs (${castVoteRecords.length}) `
        );
      }
      setCurrentTally(tally);
    }
    void calculateTally();
  }, [
    election,
    getCvrsFromExport,
    scannedBallotCount,
    precinctSelection,
    parties,
    precinctList,
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

  async function saveTally() {
    assert(currentTally);
    let compressedTalliesByPrecinct: Dictionary<CompressedTally> = {};
    // We only need to save tallies by precinct if the precinct scanner is configured for all precincts
    if (precinctSelection.kind === PrecinctSelectionKind.AllPrecincts) {
      const talliesByPrecinct = currentTally.resultsByCategory.get(
        TallyCategory.Precinct
      );
      assert(talliesByPrecinct);
      compressedTalliesByPrecinct = Object.keys(talliesByPrecinct).reduce(
        (input: Dictionary<CompressedTally>, key) => {
          const tally = talliesByPrecinct[key];
          assert(tally);
          return {
            ...input,
            [key]: compressTally(election, tally),
          };
        },
        {}
      );
    } else {
      compressedTalliesByPrecinct[precinctSelection.precinctId] = compressTally(
        election,
        currentTally.overallTally
      );
    }

    const ballotCountBreakdowns = [...currentSubTallies.entries()].reduce<
      Dictionary<BallotCountDetails>
    >((input, [key, subTally]) => {
      const bcDictionary = subTally.ballotCountsByVotingMethod;
      const newRow: BallotCountDetails = [
        bcDictionary[VotingMethod.Precinct] ?? 0,
        bcDictionary[VotingMethod.Absentee] ?? 0,
      ];
      return {
        ...input,
        [key]: newRow,
      };
    }, {});
    const talliesByParty = currentTally.resultsByCategory.get(
      TallyCategory.Party
    );
    assert(talliesByParty);
    for (const partyId of parties) {
      const subTally = partyId
        ? talliesByParty[partyId]
        : currentTally.overallTally;
      assert(subTally);
      ballotCountBreakdowns[getTallyIdentifier(partyId)] = [
        subTally.ballotCountsByVotingMethod[VotingMethod.Precinct] ?? 0,
        subTally.ballotCountsByVotingMethod[VotingMethod.Absentee] ?? 0,
      ];
    }
    assert(currentCompressedTally);

    const fullTallyInformation: PrecinctScannerCardTally = {
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: scannedBallotCount,
      isLiveMode,
      isPollsOpen: !isPollsOpen, // When we are saving we are about to either open or close polls and want the state to reflect what it will be after that is complete.
      machineId: machineConfig.machineId,
      timeSaved: Date.now(),
      precinctSelection,
      ballotCounts: ballotCountBreakdowns,
      talliesByPrecinct: compressedTalliesByPrecinct,
      tally: currentCompressedTally,
    };

    const success = await saveTallyToCard(fullTallyInformation);
    if (!success) {
      debug(
        'Error saving tally information to card, trying again without precinct-specific data'
      );
      // TODO show an error message if this attempt also fails
      await saveTallyToCard({
        ...fullTallyInformation,
        talliesByPrecinct: undefined,
        timeSaved: Date.now(),
      });
    }
  }

  async function printTallyReport() {
    await printer.print({ sides: 'one-sided' });
  }

  const [confirmOpenPolls, setConfirmOpenPolls] = useState(false);
  const [
    pollWorkerFlowState,
    setPollWorkerFlowState,
  ] = useState<PollWorkerFlowState>(PollWorkerFlowState.INIT);
  function openConfirmOpenPollsModal() {
    return setConfirmOpenPolls(true);
  }
  function closeConfirmOpenPollsModal() {
    return setConfirmOpenPolls(false);
  }
  async function openPollsAndHandleZeroReport() {
    setIsHandlingTallyReport(true);
    if (hasPrinterAttached) {
      await printTallyReport();
    } else {
      await saveTally();
    }
    togglePollsOpen();
    setIsHandlingTallyReport(false);
    setPollWorkerFlowState(PollWorkerFlowState.POLLS_OPENED_COMPLETE);
    closeConfirmOpenPollsModal();
  }

  const [confirmClosePolls, setConfirmClosePolls] = useState(false);
  function openConfirmClosePollsModal() {
    return setConfirmClosePolls(true);
  }
  function closeConfirmClosePollsModal() {
    return setConfirmClosePolls(false);
  }
  async function closePollsAndHandleTabulationReport() {
    setIsHandlingTallyReport(true);
    if (hasPrinterAttached) {
      await printTallyReport();
    } else {
      await saveTally();
    }
    togglePollsOpen();
    setIsHandlingTallyReport(false);
    setPollWorkerFlowState(
      scannedBallotCount > 0
        ? PollWorkerFlowState.POLLS_CLOSED_NEEDS_EXPORT
        : PollWorkerFlowState.POLLS_CLOSED_COMPLETE
    );
    closeConfirmClosePollsModal();
  }

  const precinctName = precinct === undefined ? 'All Precincts' : precinct.name;
  const currentTime = Date.now();

  if (pollWorkerFlowState === PollWorkerFlowState.POLLS_OPENED_COMPLETE) {
    return (
      <CenteredScreen>
        <CenteredLargeProse>
          {hasPrinterAttached ? (
            <React.Fragment>
              <h1>Polls are open.</h1>
              <p>You may remove the poll worker card.</p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1>Print the Open Polls Report</h1>
              <p>
                Insert the poll worker card into a VxMark to print the report.
              </p>
            </React.Fragment>
          )}
        </CenteredLargeProse>
      </CenteredScreen>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.POLLS_CLOSED_NEEDS_EXPORT) {
    return (
      <CenteredScreen>
        <Prose textCenter>
          <p>
            <Button primary onPress={() => setIsExportingResults(true)}>
              Export Results to USB Drive
            </Button>
          </p>
        </Prose>
        {isExportingResults && (
          <ExportResultsModal
            onClose={() => {
              setIsExportingResults(false);
              setPollWorkerFlowState(PollWorkerFlowState.POLLS_CLOSED_COMPLETE);
            }}
            usbDrive={usbDrive}
            isTestMode={!isLiveMode}
            scannedBallotCount={scannedBallotCount}
          />
        )}
      </CenteredScreen>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.POLLS_CLOSED_COMPLETE) {
    return (
      <CenteredScreen>
        <CenteredLargeProse>
          {hasPrinterAttached ? (
            <React.Fragment>
              <h1>Polls are closed.</h1>
              <p>You may remove the poll worker card.</p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1>Print the Close Polls Report</h1>
              <p>
                Insert the poll worker card into a VxMark to print the report.
              </p>
            </React.Fragment>
          )}
        </CenteredLargeProse>
      </CenteredScreen>
    );
  }

  return (
    <React.Fragment>
      <CenteredScreen infoBarMode="pollworker">
        <Prose textCenter>
          <h1>Poll Worker Actions</h1>
          <p>
            {isPollsOpen ? (
              <Button primary large onPress={openConfirmClosePollsModal}>
                Close Polls for {precinctName}
              </Button>
            ) : (
              <Button primary large onPress={openConfirmOpenPollsModal}>
                Open Polls for {precinctName}
              </Button>
            )}
          </p>
          {!isPollsOpen && scannedBallotCount > 0 && (
            <p>
              <Button onPress={() => setIsExportingResults(true)}>
                Export Results to USB Drive
              </Button>
            </p>
          )}
          <p>System Authentication Code: {systemAuthenticationCode}</p>
        </Prose>
        <Absolute top left>
          <Bar>
            <div>
              Ballots Scanned:{' '}
              <strong data-testid="ballot-count">
                {format.count(scannedBallotCount)}
              </strong>{' '}
            </div>
          </Bar>
        </Absolute>
        {(confirmOpenPolls || confirmClosePolls) && !currentTally && (
          <Modal content={<Loading>Loading Tally</Loading>} />
        )}
        {confirmOpenPolls && currentTally && !isHandlingTallyReport && (
          <Modal
            content={
              hasPrinterAttached ? (
                <PrintReportInstructions
                  title="Print the Open Polls Report"
                  count={reportPurposes.length}
                />
              ) : (
                <SaveAndPrintReportInstructions title="Save the Open Polls Report" />
              )
            }
            actions={
              <React.Fragment>
                <Button onPress={openPollsAndHandleZeroReport} primary>
                  {hasPrinterAttached ? 'Print' : 'Save'} Report and Open Polls
                </Button>
                <Button onPress={closeConfirmOpenPollsModal}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {confirmClosePolls && currentTally && !isHandlingTallyReport && (
          <Modal
            content={
              hasPrinterAttached ? (
                <PrintReportInstructions
                  title="Print the Close Polls Report"
                  count={reportPurposes.length}
                />
              ) : (
                <SaveAndPrintReportInstructions title="Save the Close Polls Report" />
              )
            }
            actions={
              <React.Fragment>
                <Button onPress={closePollsAndHandleTabulationReport} primary>
                  {hasPrinterAttached ? 'Print' : 'Save'} Report and Close Polls
                </Button>
                <Button onPress={closeConfirmClosePollsModal}>Cancel</Button>
              </React.Fragment>
            }
          />
        )}
        {isHandlingTallyReport && (
          <Modal
            content={
              <Loading>
                {hasPrinterAttached
                  ? 'Printing Tally Report'
                  : 'Saving to Card'}
              </Loading>
            }
          />
        )}
        {isExportingResults && (
          <ExportResultsModal
            onClose={() => setIsExportingResults(false)}
            usbDrive={usbDrive}
            isTestMode={!isLiveMode}
            scannedBallotCount={scannedBallotCount}
          />
        )}
      </CenteredScreen>
      {currentTally &&
        reportPurposes.map((reportPurpose) => {
          // TODO filter to precinct tally, (unless this is the only precinct then use overallTally)
          return (
            <React.Fragment key={reportPurpose}>
              <PrecinctScannerPollsReport
                ballotCount={scannedBallotCount}
                currentTime={currentTime}
                election={election}
                isLiveMode={isLiveMode}
                isPollsOpen={!isPollsOpen} // When we print the report we are about to change the polls status and want to reflect the new status
                precinctScannerMachineId={machineConfig.machineId}
                precinctSelection={precinctSelection}
                reportPurpose={reportPurpose}
              />
              <PrintableContainer>
                <TallyReport>
                  {precinctList.map((precinctId) =>
                    parties.map((partyId) => {
                      const tallyForReport = currentSubTallies.get(
                        getTallyIdentifier(partyId, precinctId)
                      );
                      assert(tallyForReport);
                      return (
                        <PrecinctScannerTallyReport
                          key={getTallyIdentifier(partyId, precinctId)}
                          data-testid={getTallyIdentifier(partyId, precinctId)}
                          electionDefinition={electionDefinition}
                          tally={tallyForReport}
                          precinctSelection={{
                            kind: PrecinctSelectionKind.SinglePrecinct,
                            precinctId,
                          }}
                          partyId={partyId}
                          reportPurpose={reportPurpose}
                          isPollsOpen={!isPollsOpen}
                          reportSavedTime={currentTime}
                        />
                      );
                    })
                  )}
                  {currentCompressedTally && scannedBallotCount > 0 && (
                    <PrecinctScannerTallyQrCode
                      electionDefinition={electionDefinition}
                      signingMachineId={machineConfig.machineId}
                      compressedTally={currentCompressedTally}
                      reportPurpose={reportPurpose}
                      isPollsOpen={!isPollsOpen}
                      isLiveMode={isLiveMode}
                      reportSavedTime={currentTime}
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
