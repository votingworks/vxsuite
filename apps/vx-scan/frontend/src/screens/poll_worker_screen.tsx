import React, { useState, useMemo } from 'react';

import {
  Button,
  Prose,
  Loading,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  fontSizeTheme,
  PrecinctScannerTallyReports,
  printElement,
  getSignedQuickResultsReportingUrl,
  PrecinctScannerBallotCountReport,
} from '@votingworks/ui';
import {
  BallotCountDetails,
  compressTally,
  computeTallyWithPrecomputedCategories,
  BooleanEnvironmentVariableName,
  getSubTalliesByPartyAndPrecinct,
  getTallyIdentifier,
  isFeatureFlagEnabled,
  ScannerReportData,
  ReportSourceMachineType,
  getPollsTransitionDestinationState,
  getPollsReportTitle,
  ScannerBallotCountReportData,
  isPollsSuspensionTransition,
  ScannerTallyReportData,
  ScannerReportDataBase,
} from '@votingworks/utils';
import {
  VotingMethod,
  TallyCategory,
  FullElectionTally,
  Tally,
  Dictionary,
  CompressedTally,
  getPartyIdsInBallotStyles,
  PollsState,
  PollsTransition,
  Optional,
  ElectionDefinition,
  PrecinctSelection,
} from '@votingworks/types';
import {
  getLogEventIdForPollsTransition,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import { assert, Result, sleep, throwIllegalValue } from '@votingworks/basics';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

import { LiveCheckModal } from '../components/live_check_modal';

import { IndeterminateProgressBar, TimesCircle } from '../components/graphics';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { rootDebug } from '../utils/debug';
import {
  exportCastVoteRecordsToUsbDrive,
  getCastVoteRecordsForTally,
  setPollsState,
  writeCardData,
} from '../api';
import { MachineConfig } from '../config/types';

export const REPRINT_REPORT_TIMEOUT_SECONDS = 4;

type PollWorkerFlowState =
  | 'open_polls_prompt'
  | 'close_polls_prompt'
  | 'polls_transition_processing'
  | 'polls_transition_complete'
  | 'reprinting_report';

const debug = rootDebug.extend('pollworker-screen');

const BallotsAlreadyScannedScreen = (
  <ScreenMainCenterChild infoBarMode="pollworker">
    <TimesCircle />
    <CenteredLargeProse>
      <h1>Ballots Already Scanned</h1>
      <p>
        Ballots were scanned on this machine before polls were opened. This may
        indicate an internal error or tampering. The polls can no longer be
        opened on this machine. Please report this issue to an election
        administrator.
      </p>
    </CenteredLargeProse>
  </ScreenMainCenterChild>
);

export interface PollWorkerScreenProps {
  machineConfig: MachineConfig;
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  scannedBallotCount: number;
  pollsState: PollsState;
  isLiveMode: boolean;
  hasPrinterAttached: boolean;
  logger: Logger;
}

export function PollWorkerScreen({
  machineConfig,
  electionDefinition,
  precinctSelection,
  scannedBallotCount,
  pollsState,
  isLiveMode,
  hasPrinterAttached: printerFromProps,
  logger,
}: PollWorkerScreenProps): JSX.Element {
  const setPollsStateMutation = setPollsState.useMutation();
  const exportCastVoteRecordsMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();
  // currentTally is the overall tally across parties and precincts
  const [currentTally, setCurrentTally] = useState<FullElectionTally>();
  // currentSubTallies are tallies split by both party and precinct. Each
  // section of the printed precinct tally report represents a subtally. We
  // don't write all these subtallies to cards for VxMark printing, however.
  // We write the ballot count details (precinct vs. absentee) and determine
  // the rest from other subtallies split only by precinct.
  const [currentSubTallies, setCurrentSubTallies] = useState<
    ReadonlyMap<string, Tally>
  >(new Map());
  const [isShowingLiveCheck, setIsShowingLiveCheck] = useState(false);
  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
  ] = useState(false);
  const hasPrinterAttached = printerFromProps || !window.kiosk;
  const { election } = electionDefinition;
  const writeCardDataMutation = writeCardData.useMutation();

  async function saveReportDataToCard(
    reportData: ScannerReportData
  ): Promise<boolean> {
    let result: Result<void, Error>;
    try {
      result = await writeCardDataMutation.mutateAsync({
        data: reportData,
        schema: 'ScannerReportDataSchema',
      });
    } catch {
      // Handled by query client's default error handling
      return false;
    }
    return result.isOk();
  }

  function initialPollWorkerFlowState(): Optional<PollWorkerFlowState> {
    switch (pollsState) {
      case 'polls_closed_initial':
      case 'polls_paused':
        return 'open_polls_prompt';
      case 'polls_open':
        return 'close_polls_prompt';
      default:
        return undefined;
    }
  }

  const [pollWorkerFlowState, setPollWorkerFlowState] = useState<
    Optional<PollWorkerFlowState>
  >(initialPollWorkerFlowState());
  const [currentPollsTransition, setCurrentPollsTransition] =
    useState<PollsTransition>();
  const [currentPollsTransitionTime, setCurrentPollsTransitionTime] =
    useState<number>();

  const currentCompressedTally = useMemo(
    () => currentTally && compressTally(election, currentTally.overallTally),
    [election, currentTally]
  );

  const parties = useMemo(
    () => getPartyIdsInBallotStyles(election),
    [election]
  );

  getCastVoteRecordsForTally.useQuery({
    onSuccess: (castVoteRecords) => {
      const tally = computeTallyWithPrecomputedCategories(
        election,
        new Set(castVoteRecords),
        [TallyCategory.Party, TallyCategory.Precinct]
      );
      // Get all tallies by precinct and party
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
    },
  });

  async function exportReportDataToCard(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number
  ) {
    const reportBasicData: ScannerReportDataBase = {
      tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER,
      machineId: machineConfig.machineId,
      isLiveMode,
      precinctSelection,
      totalBallotsScanned: scannedBallotCount,
      timeSaved: Date.now(),
      timePollsTransitioned,
    };

    if (isPollsSuspensionTransition(pollsTransition)) {
      const ballotCountReportData: ScannerBallotCountReportData = {
        ...reportBasicData,
        pollsTransition,
      };
      await saveReportDataToCard(ballotCountReportData);
      return;
    }

    assert(currentTally);
    assert(currentCompressedTally);
    let compressedTalliesByPrecinct: Dictionary<CompressedTally> = {};
    // We only need to save tallies by precinct if the precinct scanner is configured for all precincts
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

    const tallyReportData: ScannerTallyReportData = {
      ...reportBasicData,
      pollsTransition,
      tally: currentCompressedTally,
      talliesByPrecinct: compressedTalliesByPrecinct,
      ballotCounts: ballotCountBreakdowns,
    };

    const success = await saveReportDataToCard(tallyReportData);
    if (!success) {
      debug(
        'Error saving tally information to card, trying again without precinct-specific data'
      );
      // TODO show an error message if this attempt also fails.
      await saveReportDataToCard({
        ...tallyReportData,
        talliesByPrecinct: undefined,
        timeSaved: Date.now(),
      });
    }
  }

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function printReport(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number,
    copies: number
  ) {
    assert(currentCompressedTally);
    assert(currentSubTallies);

    const report = await (async () => {
      if (isPollsSuspensionTransition(pollsTransition)) {
        return (
          <PrecinctScannerBallotCountReport
            electionDefinition={electionDefinition}
            precinctSelection={precinctSelection}
            totalBallotsScanned={scannedBallotCount}
            pollsTransition={pollsTransition}
            pollsTransitionedTime={timePollsTransitioned}
            isLiveMode={isLiveMode}
            precinctScannerMachineId={machineConfig.machineId}
          />
        );
      }

      const signedQuickResultsReportingUrl =
        await getSignedQuickResultsReportingUrl({
          electionDefinition,
          isLiveMode,
          compressedTally: currentCompressedTally,
          signingMachineId: machineConfig.machineId,
        });

      return (
        <PrecinctScannerTallyReports
          electionDefinition={electionDefinition}
          precinctSelection={precinctSelection}
          subTallies={currentSubTallies}
          hasPrecinctSubTallies
          pollsTransition={pollsTransition}
          isLiveMode={isLiveMode}
          pollsTransitionedTime={timePollsTransitioned}
          precinctScannerMachineId={machineConfig.machineId}
          totalBallotsScanned={scannedBallotCount}
          signedQuickResultsReportingUrl={signedQuickResultsReportingUrl}
        />
      );
    })();

    await printElement(report, {
      sides: 'one-sided',
      copies,
    });
  }

  async function dispatchReport(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number
  ) {
    if (hasPrinterAttached) {
      await printReport(
        pollsTransition,
        timePollsTransitioned,
        DEFAULT_NUMBER_POLL_REPORT_COPIES
      );
    } else {
      await exportReportDataToCard(pollsTransition, timePollsTransitioned);
    }
  }

  async function transitionPolls(pollsTransition: PollsTransition) {
    try {
      // In compliance with VVSG 2.0 1.1.3-B, confirm there are no scanned
      // ballots before opening polls, even though this should be an impossible
      // state in production.
      if (pollsTransition === 'open_polls' && scannedBallotCount > 0) {
        setIsShowingBallotsAlreadyScannedScreen(true);
        await logger.log(LogEventId.PollsOpened, 'poll_worker', {
          disposition: 'failure',
          message:
            'Non-zero ballots scanned count detected upon attempt to open polls.',
          scannedBallotCount,
        });
        return;
      }

      const timePollsTransitioned = Date.now();
      setCurrentPollsTransition(pollsTransition);
      setPollWorkerFlowState('polls_transition_processing');
      await dispatchReport(pollsTransition, timePollsTransitioned);
      if (pollsTransition === 'close_polls' && scannedBallotCount > 0) {
        (await exportCastVoteRecordsMutation.mutateAsync()).unsafeUnwrap();
      }
      setCurrentPollsTransitionTime(timePollsTransitioned);
      await setPollsStateMutation.mutateAsync({
        pollsState: getPollsTransitionDestinationState(pollsTransition),
      });
      await logger.log(
        getLogEventIdForPollsTransition(pollsTransition),
        'poll_worker',
        {
          disposition: 'success',
          scannedBallotCount,
        }
      );
      setPollWorkerFlowState('polls_transition_complete');
    } catch (error) {
      await logger.log(
        getLogEventIdForPollsTransition(pollsTransition),
        'poll_worker',
        {
          disposition: 'failure',
          error: (error as Error).message,
        }
      );
    }
  }

  function openPolls() {
    return transitionPolls('open_polls');
  }

  function closePolls() {
    return transitionPolls('close_polls');
  }

  function pauseVoting() {
    return transitionPolls('pause_voting');
  }

  function resumeVoting() {
    return transitionPolls('resume_voting');
  }

  async function reprintReport() {
    assert(typeof currentPollsTransition === 'string');
    assert(typeof currentPollsTransitionTime === 'number');
    setPollWorkerFlowState('reprinting_report');
    await printReport(currentPollsTransition, currentPollsTransitionTime, 1);
    await sleep(REPRINT_REPORT_TIMEOUT_SECONDS * 1000);
    setPollWorkerFlowState('polls_transition_complete');
  }

  if (!currentTally) {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <Loading />
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (isShowingBallotsAlreadyScannedScreen) {
    return BallotsAlreadyScannedScreen;
  }

  if (pollWorkerFlowState === 'open_polls_prompt') {
    const pollsTransition: PollsTransition =
      pollsState === 'polls_closed_initial' ? 'open_polls' : 'resume_voting';
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <p>
            {pollsTransition === 'open_polls'
              ? 'Do you want to open the polls?'
              : 'Do you want to resume voting?'}
          </p>
          <p>
            <Button primary onPress={() => transitionPolls(pollsTransition)}>
              {pollsTransition === 'open_polls'
                ? 'Yes, Open the Polls'
                : 'Yes, Resume Voting'}
            </Button>{' '}
            <Button onPress={showAllPollWorkerActions}>No</Button>
          </p>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === 'close_polls_prompt') {
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

  if (pollWorkerFlowState === 'polls_transition_processing') {
    assert(typeof currentPollsTransition === 'string');
    const pollsTransitionProcessingText = (() => {
      switch (currentPollsTransition) {
        case 'close_polls':
          return 'Closing Polls…';
        case 'open_polls':
          return 'Opening Polls…';
        case 'pause_voting':
          return 'Pausing Voting…';
        case 'resume_voting':
          return 'Resuming Voting…';
        /* istanbul ignore next - compile-time check for completeness */
        default:
          throwIllegalValue(currentPollsTransition);
      }
    })();

    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>{pollsTransitionProcessingText}</h1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === 'polls_transition_complete') {
    assert(typeof currentPollsTransition === 'string');
    const pollsTransitionCompleteText = (() => {
      switch (currentPollsTransition) {
        case 'close_polls':
          return 'Polls are closed.';
        case 'open_polls':
          return 'Polls are open.';
        case 'resume_voting':
          return 'Voting resumed.';
        case 'pause_voting':
          return 'Voting paused.';
        /* istanbul ignore next - compile-time check for completeness */
        default:
          throwIllegalValue(currentPollsTransition);
      }
    })();

    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <h1>{pollsTransitionCompleteText}</h1>
          {hasPrinterAttached ? (
            <Prose themeDeprecated={fontSizeTheme.medium}>
              <Button onPress={reprintReport}>
                Print Additional {getPollsReportTitle(currentPollsTransition)}
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

  if (pollWorkerFlowState === 'reprinting_report') {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <IndeterminateProgressBar />
        <CenteredLargeProse>
          <h1>Printing Report…</h1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  const pollsTransitionActions = (() => {
    switch (pollsState) {
      case 'polls_closed_initial':
        return (
          <React.Fragment>
            <p>The polls have not been opened.</p>
            <p>
              <Button primary large onPress={openPolls}>
                Open Polls
              </Button>
            </p>
          </React.Fragment>
        );
      case 'polls_open':
        return (
          <React.Fragment>
            <p>The polls are currently open.</p>
            <p>
              <Button primary large onPress={closePolls}>
                Close Polls
              </Button>
            </p>
            <p>
              <Button large onPress={pauseVoting}>
                Pause Voting
              </Button>
            </p>
          </React.Fragment>
        );
      case 'polls_paused':
        return (
          <React.Fragment>
            <p>Voting is currently paused.</p>
            <p>
              <Button primary large onPress={resumeVoting}>
                Resume Voting
              </Button>
            </p>
            <p>
              <Button large onPress={closePolls}>
                Close Polls
              </Button>
            </p>
          </React.Fragment>
        );
      case 'polls_closed_final':
        return <p>Voting is complete and the polls cannot be reopened.</p>;
      /* istanbul ignore next - compile-time check for completeness */
      default:
        throwIllegalValue(pollsState);
    }
  })();

  return (
    <ScreenMainCenterChild infoBarMode="pollworker">
      <Prose textCenter>
        <h1>Poll Worker Actions</h1>
        {pollsTransitionActions}
        {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) && (
          <p>
            <Button onPress={() => setIsShowingLiveCheck(true)}>
              Live Check
            </Button>
          </p>
        )}
      </Prose>
      <ScannedBallotCount count={scannedBallotCount} />
      {isShowingLiveCheck && (
        <LiveCheckModal
          machineConfig={machineConfig}
          electionDefinition={electionDefinition}
          onClose={() => setIsShowingLiveCheck(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
