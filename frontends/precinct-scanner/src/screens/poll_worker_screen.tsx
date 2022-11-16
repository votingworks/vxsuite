import React, { useContext, useEffect, useState, useMemo } from 'react';
import makeDebug from 'debug';

import {
  Button,
  Prose,
  Loading,
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
  getSubTalliesByPartyAndPrecinct,
  getTallyIdentifier,
  isFeatureFlagEnabled,
  PrecinctScannerCardTally,
  PrecinctScannerCardTallySchema,
  sleep,
  TallySourceMachineType,
  throwIllegalValue,
  getPollsTransitionDestinationState,
  getPollsReportTitle,
  getPollsTransitionAction,
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
  PollsState,
  PollsTransition,
  Optional,
} from '@votingworks/types';
import {
  CenteredLargeProse,
  ScreenMainCenterChild,
} from '../components/layout';

import { LiveCheckModal } from '../components/live_check_modal';

import { AppContext } from '../contexts/app_context';
import { IndeterminateProgressBar } from '../components/graphics';
import { ScannedBallotCount } from '../components/scanned_ballot_count';
import { saveCvrExportToUsb } from '../utils/save_cvr_export_to_usb';
import * as scan from '../api/scan';

export const REPRINT_REPORT_TIMEOUT_SECONDS = 4;

type PollWorkerFlowState =
  | 'open_polls_prompt'
  | 'close_polls_prompt'
  | 'polls_transition_processing'
  | 'polls_transition_complete'
  | 'reprinting_report';

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

export interface PollWorkerScreenProps {
  scannedBallotCount: number;
  pollsState: PollsState;
  updatePollsState: (newPollsState: PollsState) => void;
  isLiveMode: boolean;
  hasPrinterAttached: boolean;
}

export function PollWorkerScreen({
  scannedBallotCount,
  pollsState,
  updatePollsState,
  isLiveMode,
  hasPrinterAttached: printerFromProps,
}: PollWorkerScreenProps): JSX.Element {
  const { electionDefinition, precinctSelection, machineConfig, auth } =
    useContext(AppContext);
  assert(electionDefinition);
  assert(precinctSelection);
  assert(isPollWorkerAuth(auth));
  const [currentTally, setCurrentTally] = useState<FullElectionTally>();
  const [currentSubTallies, setCurrentSubTallies] = useState<
    ReadonlyMap<string, Tally>
  >(new Map());
  const [isShowingLiveCheck, setIsShowingLiveCheck] = useState(false);
  const hasPrinterAttached = printerFromProps || !window.kiosk;
  const { election } = electionDefinition;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveTally(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number
  ) {
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
      pollsTransition,
      machineId: machineConfig.machineId,
      timeSaved: Date.now(),
      timePollsTransitioned,
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

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function printTallyReport(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number,
    copies: number
  ) {
    assert(electionDefinition);
    assert(precinctSelection);
    assert(currentCompressedTally);
    assert(currentSubTallies);

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
        precinctSelection={precinctSelection}
        subTallies={currentSubTallies}
        hasPrecinctSubTallies
        pollsTransition={pollsTransition}
        isLiveMode={isLiveMode}
        pollsTransitionedTime={timePollsTransitioned}
        currentTime={Date.now()}
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

  async function dispatchReport(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number
  ) {
    if (hasPrinterAttached) {
      await printTallyReport(
        pollsTransition,
        timePollsTransitioned,
        DEFAULT_NUMBER_POLL_REPORT_COPIES
      );
    } else {
      await saveTally(pollsTransition, timePollsTransitioned);
    }
  }

  async function exportCvrs(): Promise<void> {
    assert(electionDefinition);
    await saveCvrExportToUsb({
      electionDefinition,
      machineConfig,
      scannedBallotCount,
      isTestMode: !isLiveMode,
      openFilePickerDialog: false,
    });
  }

  async function transitionPolls(pollsTransition: PollsTransition) {
    const timePollsTransitioned = Date.now();
    setCurrentPollsTransition(pollsTransition);
    setPollWorkerFlowState('polls_transition_processing');
    await dispatchReport(pollsTransition, timePollsTransitioned);
    if (pollsTransition === 'close_polls' && scannedBallotCount > 0) {
      await exportCvrs();
    }
    setCurrentPollsTransitionTime(timePollsTransitioned);
    updatePollsState(getPollsTransitionDestinationState(pollsTransition));
    setPollWorkerFlowState('polls_transition_complete');
  }

  function openPolls() {
    return transitionPolls('open_polls');
  }

  function closePolls() {
    return transitionPolls('close_polls');
  }

  function pausePolls() {
    return transitionPolls('pause_polls');
  }

  function unpausePolls() {
    return transitionPolls('unpause_polls');
  }

  async function reprintReport() {
    assert(typeof currentPollsTransition === 'string');
    assert(typeof currentPollsTransitionTime === 'number');
    setPollWorkerFlowState('reprinting_report');
    await printTallyReport(
      currentPollsTransition,
      currentPollsTransitionTime,
      1
    );
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

  if (pollWorkerFlowState === 'open_polls_prompt') {
    const pollsTransition: PollsTransition =
      pollsState === 'polls_closed_initial' ? 'open_polls' : 'unpause_polls';
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <p>
            Do you want to{' '}
            {getPollsTransitionAction(pollsTransition).toLowerCase()} the polls?
          </p>
          <p>
            <Button primary onPress={() => transitionPolls(pollsTransition)}>
              Yes, {getPollsTransitionAction(pollsTransition)} the Polls
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
        case 'pause_polls':
          return 'Pausing Polls…';
        case 'unpause_polls':
          return 'Reopening Polls…';
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
        case 'unpause_polls':
          return 'Polls are open.';
        case 'pause_polls':
          return 'Polls are paused.';
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
            <Prose theme={fontSizeTheme.medium}>
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
              <Button large onPress={pausePolls}>
                Pause Polls
              </Button>
            </p>
          </React.Fragment>
        );
      case 'polls_paused':
        return (
          <React.Fragment>
            <p>The polls are currently paused.</p>
            <p>
              <Button primary large onPress={unpausePolls}>
                Reopen Polls
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
        {isFeatureFlagEnabled(EnvironmentFlagName.LIVECHECK) && (
          <p>
            <Button onPress={() => setIsShowingLiveCheck(true)}>
              Live Check
            </Button>
          </p>
        )}
      </Prose>
      <ScannedBallotCount count={scannedBallotCount} />
      {isShowingLiveCheck && (
        <LiveCheckModal onClose={() => setIsShowingLiveCheck(false)} />
      )}
    </ScreenMainCenterChild>
  );
}
