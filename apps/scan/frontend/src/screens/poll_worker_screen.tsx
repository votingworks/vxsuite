import React, { useState } from 'react';

import {
  Button,
  Loading,
  DEFAULT_NUMBER_POLL_REPORT_COPIES,
  CenteredLargeProse,
  LoadingAnimation,
  H1,
  P,
  PowerDownButton,
  FullScreenIconWrapper,
  Icons,
} from '@votingworks/ui';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import {
  PollsTransitionType,
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
  assertFalsy,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import styled from 'styled-components';
import pluralize from 'pluralize';
import type {
  PollsTransition,
  PrecinctScannerPollsInfo,
} from '@votingworks/scan-backend';
import { ScreenMainCenterChild, Screen } from '../components/layout';
import {
  exportCastVoteRecordsToUsbDrive,
  getScannerResultsByParty,
  getUsbDriveStatus,
  transitionPolls as apiTransitionPolls,
} from '../api';
import { MachineConfig } from '../config/types';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { LiveCheckButton } from '../components/live_check_button';
import { CastVoteRecordSyncRequiredModal } from './cast_vote_record_sync_required_screen';
import { printReport } from '../utils/print_report';
import { ReprintReportButton } from '../components/reprint_report_button';
import { getCurrentTime } from '../utils/get_current_time';

export const REPRINT_REPORT_TIMEOUT_SECONDS = 4;

type PollWorkerFlowState =
  | 'open_polls_prompt'
  | 'close_polls_prompt'
  | 'polls_transition_processing'
  | 'polls_transition_complete'
  | 'reprinting_report'
  | 'reprinting_previous_report_complete';

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
  pollsInfo: PrecinctScannerPollsInfo;
  isLiveMode: boolean;
  printerInfo?: KioskBrowser.PrinterInfo;
  logger: Logger;
  precinctReportDestination: PrecinctReportDestination;
  isContinuousExportEnabled: boolean;
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
  pollsInfo,
  isLiveMode,
  printerInfo,
  logger,
  precinctReportDestination,
  isContinuousExportEnabled,
}: PollWorkerScreenProps): JSX.Element {
  const scannerResultsByPartyQuery = getScannerResultsByParty.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const transitionPollsMutation = apiTransitionPolls.useMutation();
  const exportCastVoteRecordsMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();
  const [numReportPages, setNumReportPages] = useState<number>();
  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
  ] = useState(false);
  const [
    isCastVoteRecordSyncRequiredModalOpen,
    setIsCastVoteRecordSyncRequiredModalOpen,
  ] = useState(false);
  const needsToAttachPrinterToTransitionPolls = !printerInfo && !!window.kiosk;
  const { pollsState } = pollsInfo;

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

  // Optimistically set lastPollsTransition based on mutation input if it
  // exists. The query may not have updated by the time we need to show a
  // screen that depends on lastPollsTransition. During a transition,
  // lastPollsTransition is really the currentPollsTransition.
  const lastPollsTransition: Optional<PollsTransition> =
    transitionPollsMutation.variables
      ? {
          // eslint-disable-next-line vx/gts-spread-like-types
          ...transitionPollsMutation.variables,
          ballotCount: scannedBallotCount,
        }
      : pollsInfo.pollsState !== 'polls_closed_initial'
      ? pollsInfo.lastPollsTransition
      : undefined;

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function transitionPolls(pollsTransitionType: PollsTransitionType) {
    try {
      // In compliance with VVSG 2.0 1.1.3-B, confirm there are no scanned
      // ballots before opening polls, even though this should be an impossible
      // state in production.
      if (pollsTransitionType === 'open_polls' && scannedBallotCount > 0) {
        setIsShowingBallotsAlreadyScannedScreen(true);
        await logger.log(LogEventId.PollsOpened, 'poll_worker', {
          disposition: 'failure',
          message:
            'Non-zero ballots scanned count detected upon attempt to open polls.',
          scannedBallotCount,
        });
        return;
      }

      const pollsTransitionTime = getCurrentTime();
      await transitionPollsMutation.mutateAsync({
        type: pollsTransitionType,
        time: pollsTransitionTime,
      });
      setPollWorkerFlowState('polls_transition_processing');

      assert(scannerResultsByPartyQuery.data);
      await printReport({
        pollsTransitionInfo: {
          type: pollsTransitionType,
          time: pollsTransitionTime,
          ballotCount: scannedBallotCount,
        },
        electionDefinition,
        precinctSelection,
        isLiveMode,
        machineConfig,
        scannerResultsByParty: scannerResultsByPartyQuery.data,
        copies:
          precinctReportDestination === 'thermal-sheet-printer'
            ? 1
            : DEFAULT_NUMBER_POLL_REPORT_COPIES,
        numPagesCallback: setNumReportPages,
      });

      if (
        isContinuousExportEnabled &&
        pollsTransitionType === 'close_polls' &&
        scannedBallotCount > 0
      ) {
        (
          await exportCastVoteRecordsMutation.mutateAsync({
            mode: 'polls_closing',
          })
        ).unsafeUnwrap();
      }

      await logger.log(
        getLogEventIdForPollsTransition(pollsTransitionType),
        'poll_worker',
        {
          disposition: 'success',
          scannedBallotCount,
        }
      );
      setPollWorkerFlowState('polls_transition_complete');
    } catch (error) {
      await logger.log(
        getLogEventIdForPollsTransition(pollsTransitionType),
        'poll_worker',
        {
          disposition: 'failure',
          error: (error as Error).message,
        }
      );
      throw error;
    }
  }

  function openPolls() {
    return transitionPolls('open_polls');
  }

  function closePolls() {
    if (usbDriveStatusQuery.data?.doesUsbDriveRequireCastVoteRecordSync) {
      setIsCastVoteRecordSyncRequiredModalOpen(true);
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
    const pollsTransition: PollsTransitionType =
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
        {isCastVoteRecordSyncRequiredModalOpen && (
          <CastVoteRecordSyncRequiredModal
            blockedAction="close_polls"
            closeModal={() => setIsCastVoteRecordSyncRequiredModalOpen(false)}
          />
        )}
      </ScreenMainCenterChild>
    );
  }

  if (pollWorkerFlowState === 'polls_transition_processing') {
    assert(lastPollsTransition);
    const pollsTransitionProcessingText = (() => {
      const pollsTransitionType = lastPollsTransition.type;
      switch (pollsTransitionType) {
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
          throwIllegalValue(pollsTransitionType);
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

  if (
    pollWorkerFlowState === 'polls_transition_complete' ||
    pollWorkerFlowState === 'reprinting_previous_report_complete'
  ) {
    assert(lastPollsTransition);
    const primaryText = (() => {
      if (pollWorkerFlowState === 'reprinting_previous_report_complete') {
        return '';
      }

      const pollsTransitionType = lastPollsTransition.type;
      switch (pollsTransitionType) {
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
          throwIllegalValue(pollsTransitionType);
      }
    })();

    return (
      <ScreenMainCenterChild infoBarMode="pollworker">
        <CenteredLargeProse>
          {primaryText && <H1>{primaryText}</H1>}
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
            Remove the poll worker card once you have printed all necessary
            reports.
          </P>
          <P>
            <ReprintReportButton
              printerInfo={printerInfo}
              lastPollsTransition={lastPollsTransition}
              scannedBallotCount={scannedBallotCount}
              isAdditional
              beforePrint={() => setPollWorkerFlowState('reprinting_report')}
              afterPrint={() =>
                setPollWorkerFlowState('polls_transition_complete')
              }
            />
          </P>
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

  // compile-time check for completeness
  assertFalsy(pollWorkerFlowState);

  const commonActions = (
    <React.Fragment>
      {pollsInfo.pollsState !== 'polls_closed_initial' && (
        <ReprintReportButton
          printerInfo={printerInfo}
          scannedBallotCount={scannedBallotCount}
          lastPollsTransition={pollsInfo.lastPollsTransition}
          isAdditional={false}
          beforePrint={() => setPollWorkerFlowState('reprinting_report')}
          afterPrint={() =>
            setPollWorkerFlowState('reprinting_previous_report_complete')
          }
        />
      )}
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
      <H1>Poll Worker Actions</H1>
      {content}
      {isCastVoteRecordSyncRequiredModalOpen && (
        <CastVoteRecordSyncRequiredModal
          blockedAction="close_polls"
          closeModal={() => setIsCastVoteRecordSyncRequiredModalOpen(false)}
        />
      )}
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
