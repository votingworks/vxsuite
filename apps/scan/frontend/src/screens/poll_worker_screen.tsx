import React, { useState } from 'react';

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
  CenteredLargeProse,
  LoadingAnimation,
  H1,
  P,
  PowerDownButton,
  FullScreenIconWrapper,
  Icons,
} from '@votingworks/ui';
import {
  compressTally,
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  getPollsTransitionDestinationState,
  getPollsReportTitle,
  isPollsSuspensionTransition,
  combineElectionResults,
} from '@votingworks/utils';
import {
  PollsState,
  PollsTransition,
  ElectionDefinition,
  PrecinctSelection,
  PrecinctReportDestination,
} from '@votingworks/types';
import {
  getLogEventIdForPollsTransition,
  LogEventId,
  Logger,
} from '@votingworks/logging';
import {
  assert,
  Optional,
  sleep,
  throwIllegalValue,
} from '@votingworks/basics';
import styled from 'styled-components';
import pluralize from 'pluralize';
import { ScreenMainCenterChild, Screen } from '../components/layout';
import { rootDebug } from '../utils/debug';
import {
  exportCastVoteRecordsToUsbDrive,
  getScannerResultsByParty,
  getUsbDriveStatus,
  setPollsState,
} from '../api';
import { MachineConfig } from '../config/types';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { LiveCheckButton } from '../components/live_check_button';
import { getPageCount } from '../utils/get_page_count';
import { CastVoteRecordSyncReminderModal } from '../components/cast_vote_record_sync_modal';

export const REPRINT_REPORT_TIMEOUT_SECONDS = 4;

type PollWorkerFlowState =
  | 'open_polls_prompt'
  | 'close_polls_prompt'
  | 'polls_transition_processing'
  | 'polls_transition_complete'
  | 'reprinting_report';

const debug = rootDebug.extend('pollworker-screen');

const BallotsAlreadyScannedScreen = (
  <Screen centerContent infoBarMode="pollworker">
    <FullScreenPromptLayout
      title="Ballots Already Scanned"
      image={
        <FullScreenIconWrapper>
          <Icons.Delete color="danger" />
        </FullScreenIconWrapper>
      }
    >
      <P>
        Ballots were scanned on this machine before polls were opened. This may
        indicate an internal error or tampering. The polls can no longer be
        opened on this machine. Please report this issue to an election
        administrator.
      </P>
    </FullScreenPromptLayout>
  </Screen>
);

export interface PollWorkerScreenProps {
  machineConfig: MachineConfig;
  electionDefinition: ElectionDefinition;
  precinctSelection: PrecinctSelection;
  scannedBallotCount: number;
  pollsState: PollsState;
  isLiveMode: boolean;
  printerInfo?: KioskBrowser.PrinterInfo;
  logger: Logger;
  precinctReportDestination: PrecinctReportDestination;
}

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr 1fr;
`;

export function PollWorkerScreen({
  machineConfig,
  electionDefinition,
  precinctSelection,
  scannedBallotCount,
  pollsState,
  isLiveMode,
  printerInfo,
  logger,
  precinctReportDestination,
}: PollWorkerScreenProps): JSX.Element {
  const { election } = electionDefinition;
  const scannerResultsByPartyQuery = getScannerResultsByParty.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const setPollsStateMutation = setPollsState.useMutation();
  const exportCastVoteRecordsMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();
  const [numReportPages, setNumReportPages] = useState<number>();
  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
  ] = useState(false);
  const [
    isCastVoteRecordSyncReminderModalOpen,
    setIsCastVoteRecordSyncReminderModalOpen,
  ] = useState(false);
  const needsToAttachPrinterToTransitionPolls = !printerInfo && !!window.kiosk;

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

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function printReport(
    pollsTransition: PollsTransition,
    timePollsTransitioned: number,
    copies: number
  ) {
    const scannerResultsByParty = scannerResultsByPartyQuery.data;
    assert(scannerResultsByParty);
    const combinedScannerResults = combineElectionResults({
      election,
      allElectionResults: scannerResultsByParty,
    });

    const report = await (async () => {
      if (isPollsSuspensionTransition(pollsTransition)) {
        debug('printing ballot count report...');
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

      debug('printing tally report...');

      const signedQuickResultsReportingUrl =
        await getSignedQuickResultsReportingUrl({
          electionDefinition,
          isLiveMode,
          compressedTally: compressTally(
            electionDefinition.election,
            combinedScannerResults
          ),
          signingMachineId: machineConfig.machineId,
        });

      return (
        <PrecinctScannerTallyReports
          electionDefinition={electionDefinition}
          precinctSelection={precinctSelection}
          electionResultsByParty={scannerResultsByParty}
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

    /* istanbul ignore next - prototype */
    if (precinctReportDestination === 'thermal-sheet-printer') {
      setNumReportPages(await getPageCount(report));
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
      await printReport(
        pollsTransition,
        timePollsTransitioned,
        /* istanbul ignore next - prototype */
        precinctReportDestination === 'thermal-sheet-printer'
          ? 1
          : DEFAULT_NUMBER_POLL_REPORT_COPIES
      );
      if (pollsTransition === 'close_polls' && scannedBallotCount > 0) {
        (
          await exportCastVoteRecordsMutation.mutateAsync({
            mode: 'polls_closing',
          })
        ).unsafeUnwrap();
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
    if (usbDriveStatusQuery.data?.doesUsbDriveRequireCastVoteRecordSync) {
      setIsCastVoteRecordSyncReminderModalOpen(true);
      return;
    }
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

  if (
    !scannerResultsByPartyQuery.isSuccess ||
    scannerResultsByPartyQuery.isFetching
  ) {
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
          <P>
            {pollsTransition === 'open_polls'
              ? 'Do you want to open the polls?'
              : 'Do you want to resume voting?'}
          </P>
          <P>
            <Button
              variant="primary"
              onPress={transitionPolls}
              value={pollsTransition}
              disabled={needsToAttachPrinterToTransitionPolls}
            >
              {pollsTransition === 'open_polls'
                ? 'Yes, Open the Polls'
                : 'Yes, Resume Voting'}
            </Button>{' '}
            <Button onPress={showAllPollWorkerActions}>No</Button>
          </P>
          {needsToAttachPrinterToTransitionPolls && (
            <P>Attach printer to continue.</P>
          )}
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === 'close_polls_prompt') {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          <P>Do you want to close the polls?</P>
          <P>
            <Button
              variant="primary"
              onPress={closePolls}
              disabled={needsToAttachPrinterToTransitionPolls}
            >
              Yes, Close the Polls
            </Button>{' '}
            <Button onPress={showAllPollWorkerActions}>No</Button>
          </P>
          {needsToAttachPrinterToTransitionPolls && (
            <P>Attach printer to continue.</P>
          )}
        </CenteredLargeProse>
        {isCastVoteRecordSyncReminderModalOpen && (
          <CastVoteRecordSyncReminderModal
            blockedAction="close_polls"
            closeModal={() => setIsCastVoteRecordSyncReminderModalOpen(false)}
          />
        )}
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
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>{pollsTransitionProcessingText}</H1>
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
          <H1>{pollsTransitionCompleteText}</H1>
          <Prose themeDeprecated={fontSizeTheme.medium}>
            {/* istanbul ignore next - prototype */}
            {precinctReportDestination === 'thermal-sheet-printer' && (
              <P>
                Insert{' '}
                {numReportPages
                  ? `${numReportPages} ${pluralize(
                      'sheet',
                      numReportPages
                    )} of paper`
                  : 'paper'}{' '}
                into the printer to print the report.
              </P>
            )}
            <P>
              <Button
                onPress={reprintReport}
                disabled={needsToAttachPrinterToTransitionPolls}
              >
                Print Additional {getPollsReportTitle(currentPollsTransition)}
              </Button>
            </P>
            <P>
              Remove the poll worker card if you have printed all necessary
              reports.
            </P>
          </Prose>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === 'reprinting_report') {
    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>Printing Report…</H1>
        </CenteredLargeProse>
      </ScreenMainCenterChild>
    );
  }

  const commonActions = (
    <React.Fragment>
      <PowerDownButton logger={logger} userRole="poll_worker" />
      {isFeatureFlagEnabled(BooleanEnvironmentVariableName.LIVECHECK) && (
        <LiveCheckButton />
      )}
    </React.Fragment>
  );

  const content = (() => {
    switch (pollsState) {
      case 'polls_closed_initial':
        return (
          <React.Fragment>
            <P>The polls have not been opened.</P>
            <ButtonGrid>
              <Button variant="primary" onPress={openPolls}>
                Open Polls
              </Button>
              {commonActions}
            </ButtonGrid>
          </React.Fragment>
        );
      case 'polls_open':
        return (
          <React.Fragment>
            <P>The polls are currently open.</P>
            <ButtonGrid>
              <Button variant="primary" onPress={closePolls}>
                Close Polls
              </Button>
              <Button onPress={pauseVoting}>Pause Voting</Button>
              {commonActions}
            </ButtonGrid>
          </React.Fragment>
        );
      case 'polls_paused':
        return (
          <React.Fragment>
            <P>Voting is currently paused.</P>
            <ButtonGrid>
              <Button variant="primary" onPress={resumeVoting}>
                Resume Voting
              </Button>
              <Button onPress={closePolls}>Close Polls</Button>
              {commonActions}
            </ButtonGrid>
          </React.Fragment>
        );
      case 'polls_closed_final':
        return (
          <React.Fragment>
            <P>Voting is complete and the polls cannot be reopened.</P>
            <ButtonGrid>{commonActions}</ButtonGrid>
          </React.Fragment>
        );
      /* istanbul ignore next - compile-time check for completeness */
      default:
        throwIllegalValue(pollsState);
    }
  })();

  return (
    <ScreenMainCenterChild infoBarMode="pollworker">
      <Prose textCenter>
        <H1>Poll Worker Actions</H1>
        {content}
      </Prose>
      {isCastVoteRecordSyncReminderModalOpen && (
        <CastVoteRecordSyncReminderModal
          blockedAction="close_polls"
          closeModal={() => setIsCastVoteRecordSyncReminderModalOpen(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
