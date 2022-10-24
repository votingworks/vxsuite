import React, { useContext, useEffect, useState, useMemo } from 'react';
import makeDebug from 'debug';

import {
  Button,
  Prose,
  Loading,
  UsbDrive,
  isPollWorkerAuth,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  fontSizeTheme,
  PrecinctScannerFullReport,
  printElement,
  getSignedQuickResultsReportingUrl,
} from '@votingworks/ui';
import {
  assert,
  BallotCountDetails,
  compressTally,
  computeTallyWithPrecomputedCategories,
  EnvironmentFlagName,
  getPrecinctSelectionName,
  getSubTalliesByPartyAndPrecinct,
  getTallyIdentifier,
  isFeatureFlagEnabled,
  PrecinctScannerCardTally,
  PrecinctScannerCardTallySchema,
  singlePrecinctSelectionFor,
  sleep,
  TallySourceMachineType,
} from '@votingworks/utils';
import {
  CastVoteRecord,
  VotingMethod,
  TallyCategory,
  FullElectionTally,
  Tally,
  Dictionary,
  CompressedTally,
  getPartyIdsInBallotStyles,
  InsertedSmartcardAuth,
} from '@votingworks/types';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

import { ExportResultsModal } from '../components/export_results_modal';
import { LiveCheckModal } from '../components/live_check_modal';

import { AppContext } from '../contexts/app_context';
import { IndeterminateProgressBar } from '../components/graphics';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { saveCvrExportToUsb } from '../utils/save_cvr_export_to_usb';
import * as scan from '../api/scan';

export const REPRINT_REPORT_TIMEOUT_SECONDS = 4;

enum PollWorkerFlowState {
  OPEN_POLLS_FLOW__CONFIRM = 'open polls flow: confirm',
  OPEN_POLLS_FLOW__PROCESSING = 'open polls flow: processing',
  OPEN_POLLS_FLOW__COMPLETE = 'open polls flow: complete',
  CLOSE_POLLS_FLOW__CONFIRM = 'close polls flow: confirm',
  CLOSE_POLLS_FLOW__PROCESSING = 'close polls flow: processing',
  CLOSE_POLLS_FLOW__COMPLETE = 'close polls flow: complete',
  EITHER_FLOW__REPRINTING = 'either polls flow: reprinting',
}

async function saveTallyToCard(
  auth: InsertedSmartcardAuth.PollWorkerLoggedIn,
  cardTally: PrecinctScannerCardTally
): Promise<boolean> {
  await auth.card.writeStoredData(cardTally);
  const possibleTally = await auth.card.readStoredObject(
    PrecinctScannerCardTallySchema
  );
  return possibleTally.ok()?.timeSaved === cardTally.timeSaved;
}

async function getCvrsFromExport(): Promise<CastVoteRecord[]> {
  const castVoteRecordsString = await scan.getExportWithoutImages();
  const lines = castVoteRecordsString.split('\n');
  const cvrs = lines.flatMap((line) =>
    line.length > 0 ? (JSON.parse(line) as CastVoteRecord) : []
  );
  // TODO add more validation of the CVR, move the validation code from election-manager to utils
  return cvrs.filter((cvr) => cvr._precinctId !== undefined);
}

const debug = makeDebug('precinct-scanner:pollworker-screen');

interface Props {
  scannedBallotCount: number;
  isPollsOpen: boolean;
  isLiveMode: boolean;
  togglePollsOpen: () => void;
  hasPrinterAttached: boolean;
  usbDrive: UsbDrive;
}

export function PollWorkerScreen({
  scannedBallotCount,
  isPollsOpen,
  togglePollsOpen,
  isLiveMode,
  hasPrinterAttached: printerFromProps,
  usbDrive,
}: Props): JSX.Element {
  const { electionDefinition, precinctSelection, machineConfig, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(precinctSelection);
  assert(isPollWorkerAuth(auth));
  const [currentTally, setCurrentTally] = useState<FullElectionTally>();
  const [currentSubTallies, setCurrentSubTallies] = useState<
    ReadonlyMap<string, Tally>
  >(new Map());
  const [isExportingResults, setIsExportingResults] = useState(false);
  const [isShowingLiveCheck, setIsShowingLiveCheck] = useState(false);
  const [pollsToggledTime, setPollsToggledTime] = useState<number>();
  const hasPrinterAttached = printerFromProps || !window.kiosk;
  const { election } = electionDefinition;

  const currentTime = Date.now();

  const currentCompressedTally = useMemo(
    () => currentTally && compressTally(election, currentTally.overallTally),
    [election, currentTally]
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
      assert(precinctSelection);
      setCurrentSubTallies(
        getSubTalliesByPartyAndPrecinct({
          election,
          tally,
          precinctSelection,
        })
      );
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
  }, [election, scannedBallotCount, precinctSelection]);

  async function saveTally() {
    assert(currentTally);
    let compressedTalliesByPrecinct: Dictionary<CompressedTally> = {};
    // We only need to save tallies by precinct if the precinct scanner is configured for all precincts
    assert(precinctSelection);
    if (precinctSelection.kind === 'AllPrecincts') {
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
      timeSaved: currentTime,
      timePollsToggled: currentTime,
      precinctSelection,
      ballotCounts: ballotCountBreakdowns,
      talliesByPrecinct: compressedTalliesByPrecinct,
      tally: currentCompressedTally,
    };

    assert(isPollWorkerAuth(auth));
    const success = await saveTallyToCard(auth, fullTallyInformation);
    if (!success) {
      debug(
        'Error saving tally information to card, trying again without precinct-specific data'
      );
      // TODO show an error message if this attempt also fails.
      await saveTallyToCard(auth, {
        ...fullTallyInformation,
        talliesByPrecinct: undefined,
        timeSaved: Date.now(),
      });
    }
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

  async function printTallyReport(copies: number) {
    assert(electionDefinition);
    assert(precinctSelection);
    assert(currentCompressedTally);
    assert(currentSubTallies);

    const isPollsOpenForReport =
      pollWorkerFlowState === PollWorkerFlowState.EITHER_FLOW__REPRINTING ||
      pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__COMPLETE ||
      pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__COMPLETE
        ? isPollsOpen
        : !isPollsOpen;

    const precinctSelectionList =
      precinctSelection.kind === 'SinglePrecinct'
        ? [precinctSelection]
        : election.precincts.map(({ id }) => singlePrecinctSelectionFor(id));

    const signedQuickResultsReportingUrl =
      await getSignedQuickResultsReportingUrl({
        electionDefinition,
        isLiveMode,
        compressedTally: currentCompressedTally,
        signingMachineId: machineConfig.machineId,
      });

    await printElement(
      <PrecinctScannerFullReport
        electionDefinition={electionDefinition}
        precinctSelectionList={precinctSelectionList}
        subTallies={currentSubTallies}
        isPollsOpen={isPollsOpenForReport}
        isLiveMode={isLiveMode}
        pollsToggledTime={pollsToggledTime || currentTime}
        currentTime={currentTime}
        precinctScannerMachineId={machineConfig.machineId}
        totalBallotsScanned={scannedBallotCount}
        signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
      />,
      {
        sides: 'one-sided',
        copies,
      }
    );
  }

  async function dispatchReport() {
    setPollsToggledTime(currentTime);
    if (hasPrinterAttached) {
      await printTallyReport(DEFAULT_NUMBER_POLL_REPORT_COPIES);
    } else {
      await saveTally();
    }
  }

  async function openPolls() {
    setPollWorkerFlowState(PollWorkerFlowState.OPEN_POLLS_FLOW__PROCESSING);
    await dispatchReport();
    togglePollsOpen();
    setPollWorkerFlowState(PollWorkerFlowState.OPEN_POLLS_FLOW__COMPLETE);
  }

  async function closePolls() {
    assert(electionDefinition);
    setPollWorkerFlowState(PollWorkerFlowState.CLOSE_POLLS_FLOW__PROCESSING);
    await dispatchReport();
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

  async function reprintReport() {
    const initialFlowState = pollWorkerFlowState;
    setPollWorkerFlowState(PollWorkerFlowState.EITHER_FLOW__REPRINTING);
    await printTallyReport(1);
    await sleep(REPRINT_REPORT_TIMEOUT_SECONDS * 1000);
    setPollWorkerFlowState(initialFlowState);
  }

  const precinctName = getPrecinctSelectionName(
    electionDefinition.election.precincts,
    precinctSelection
  );

  if (!currentTally) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <Loading />
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__CONFIRM) {
    return (
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
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__PROCESSING) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Opening Polls…</h1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.OPEN_POLLS_FLOW__COMPLETE) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <h1>Polls are open.</h1>
          {hasPrinterAttached ? (
            <Prose theme={fontSizeTheme.medium}>
              <Button onPress={reprintReport}>
                Print Additional Polls Opened Report
              </Button>
              <p>
                Remove the poll worker card if you have printed all necessary
                reports.
              </p>
            </Prose>
          ) : (
            <p>Insert poll worker card into VxMark to print the report.</p>
          )}
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__CONFIRM) {
    return (
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
    );
  }

  if (
    pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__PROCESSING
  ) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Closing Polls…</h1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.CLOSE_POLLS_FLOW__COMPLETE) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <h1>Polls are closed.</h1>
          {hasPrinterAttached ? (
            <Prose theme={fontSizeTheme.medium}>
              <Button onPress={reprintReport}>
                Print Additional Polls Closed Report
              </Button>
              <p>
                Remove the poll worker card if you have printed all necessary
                reports.
              </p>
            </Prose>
          ) : (
            <p>Insert poll worker card into VxMark to print the report.</p>
          )}
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === PollWorkerFlowState.EITHER_FLOW__REPRINTING) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Printing Report…</h1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }
  return (
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
              Save Results to USB Drive
            </Button>
          </p>
        )}
        {isFeatureFlagEnabled(EnvironmentFlagName.LIVECHECK) && (
          <p>
            <Button onPress={() => setIsShowingLiveCheck(true)}>
              Live Check
            </Button>
          </p>
        )}
      </Prose>
      <ScannedBallotCount count={scannedBallotCount} />
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
  );
}
