import React, { useContext, useEffect, useState, useMemo } from 'react';
import makeDebug from 'debug';

import {
  Button,
  Prose,
  Loading,
  PrecinctScannerPollsReport,
  PrecinctScannerTallyReport,
  PrecinctScannerTallyQrCode,
  PrintableContainer,
  TallyReport,
  UsbDrive,
  Bar,
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
import { isLiveCheckEnabled } from '../config/features';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';
import { Absolute } from '../components/absolute';

import { ExportResultsModal } from '../components/export_results_modal';
import { LiveCheckModal } from '../components/live_check_modal';

import { AppContext } from '../contexts/app_context';
import { IndeterminateProgressBar } from '../components/graphics';
import { saveCvrExportToUsb } from '../utils/save_cvr_export_to_usb';

enum PollWorkerFlowState {
  OPEN_POLLS_FLOW__CONFIRM = 'open polls flow: confirm',
  OPEN_POLLS_FLOW__PROCESSING = 'open polls flow: processing',
  OPEN_POLLS_FLOW__COMPLETE = 'open polls flow: complete',
  CLOSE_POLLS_FLOW__CONFIRM = 'close polls flow: confirm',
  CLOSE_POLLS_FLOW__PROCESSING = 'close polls flow: processing',
  CLOSE_POLLS_FLOW__COMPLETE = 'close polls flow: complete',
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
  const {
    electionDefinition,
    currentPrecinctId,
    machineConfig,
    currentUserSession,
  } = useContext(AppContext);
  assert(electionDefinition);
  const [currentTally, setCurrentTally] = useState<FullElectionTally>();
  const [currentSubTallies, setCurrentSubTallies] = useState<
    ReadonlyMap<string, Tally>
  >(new Map());
  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isShowingLiveCheck, setIsShowingLiveCheck] = useState(false);
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

  const parties = useMemo(
    () => getPartyIdsInBallotStyles(election),
    [election]
  );

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
      // TODO show an error message if this attempt also fails.
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

  const [pollWorkerFlowState, setPollWorkerFlowState] = useState<
    PollWorkerFlowState | undefined
  >(
    isPollsOpen
      ? PollWorkerFlowState.CLOSE_POLLS_FLOW__CONFIRM
      : PollWorkerFlowState.OPEN_POLLS_FLOW__CONFIRM
  );
  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function openPolls() {
    setPollWorkerFlowState(PollWorkerFlowState.OPEN_POLLS_FLOW__PROCESSING);
    if (hasPrinterAttached) {
      await printTallyReport();
    } else {
      await saveTally();
    }
    togglePollsOpen();
    setPollWorkerFlowState(PollWorkerFlowState.OPEN_POLLS_FLOW__COMPLETE);
  }

  async function closePolls() {
    assert(electionDefinition);
    assert(currentUserSession);
    setPollWorkerFlowState(PollWorkerFlowState.CLOSE_POLLS_FLOW__PROCESSING);
    if (hasPrinterAttached) {
      await printTallyReport();
    } else {
      await saveTally();
    }
    if (scannedBallotCount > 0) {
      await saveCvrExportToUsb({
        electionDefinition,
        machineConfig,
        scannedBallotCount,
        isTestMode: !isLiveMode,
        openFilePickerDialog: false,
      });
    }
    togglePollsOpen();
    setPollWorkerFlowState(PollWorkerFlowState.CLOSE_POLLS_FLOW__COMPLETE);
  }

  const precinctName = precinct === undefined ? 'All Precincts' : precinct.name;
  const currentTime = Date.now();

  if (!currentTally) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <Loading />
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  const printableReport =
    currentTally &&
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
    });

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__CONFIRM) {
    return (
      <React.Fragment>
        <ScreenMainCenterChild infoBarMode="pollworker">
          <CenteredLargeProse>
            <p>Do you want to open the polls?</p>
            <p>
              <Button primary onPress={openPolls}>
                Yes, Open the Polls
              </Button>{' '}
              <Button onPress={showAllPollWorkerActions}>No</Button>
            </p>
          </CenteredLargeProse>
        </ScreenMainCenterChild>
        {printableReport}
      </React.Fragment>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__PROCESSING) {
    return (
      <React.Fragment>
        <ScreenMainCenterChild infoBarMode="pollworker">
          <IndeterminateProgressBar />
          <CenteredLargeProse>
            <h1>Opening Polls…</h1>
          </CenteredLargeProse>
        </ScreenMainCenterChild>
        {printableReport}
      </React.Fragment>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__COMPLETE) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <h1>Polls are open.</h1>
          {hasPrinterAttached ? (
            <p>Remove the poll worker card.</p>
          ) : (
            <p>Insert poll worker card into VxMark to print the report.</p>
          )}
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__CONFIRM) {
    return (
      <React.Fragment>
        <ScreenMainCenterChild infoBarMode="pollworker">
          <CenteredLargeProse>
            <p>Do you want to close the polls?</p>
            <p>
              <Button primary onPress={closePolls}>
                Yes, Close the Polls
              </Button>{' '}
              <Button onPress={showAllPollWorkerActions}>No</Button>
            </p>
          </CenteredLargeProse>
        </ScreenMainCenterChild>
        {printableReport}
      </React.Fragment>
    );
  }

  if (
    pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__PROCESSING
  ) {
    return (
      <React.Fragment>
        <ScreenMainCenterChild infoBarMode="pollworker">
          <IndeterminateProgressBar />
          <CenteredLargeProse>
            <h1>Closing Polls…</h1>
          </CenteredLargeProse>
        </ScreenMainCenterChild>
        {printableReport}
      </React.Fragment>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__COMPLETE) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <h1>Polls are closed.</h1>
          {hasPrinterAttached ? (
            <p>Remove the poll worker card.</p>
          ) : (
            <p>Insert poll worker card into VxMark to print the report.</p>
          )}
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }
  return (
    <React.Fragment>
      <ScreenMainCenterChild infoBarMode="pollworker">
        <Prose textCenter>
          <h1>Poll Worker Actions</h1>
          <p>
            {isPollsOpen ? (
              <Button primary large onPress={closePolls}>
                Close Polls for {precinctName}
              </Button>
            ) : (
              <Button primary large onPress={openPolls}>
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
          {isLiveCheckEnabled() && (
            <p>
              <Button onPress={() => setIsShowingLiveCheck(true)}>
                Live Check
              </Button>
            </p>
          )}
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
        {isExportingResults && (
          <ExportResultsModal
            onClose={() => setIsExportingResults(false)}
            usbDrive={usbDrive}
            isTestMode={!isLiveMode}
            scannedBallotCount={scannedBallotCount}
          />
        )}
        {isShowingLiveCheck && (
          <LiveCheckModal onClose={() => setIsShowingLiveCheck(false)} />
        )}
      </ScreenMainCenterChild>
      {printableReport}
    </React.Fragment>
  );
}
