import React, { useState } from 'react';

import {
  Button,
  CenteredLargeProse,
  Loading,
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
import { ElectionDefinition, PollsTransitionType } from '@votingworks/types';
import {
  getLogEventIdForPollsTransition,
  LogEventId,
  BaseLogger,
} from '@votingworks/logging';
import {
  assert,
  assertFalsy,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import styled from 'styled-components';
import type {
  FujitsuPrintResult,
  PollsTransition,
  PrecinctScannerPollsInfo,
  PrinterStatus,
} from '@votingworks/scan-backend';
import {
  ScreenMainCenterChild,
  CenteredScreenProps,
} from '../components/layout';
import {
  exportCastVoteRecordsToUsbDrive,
  getUsbDriveStatus,
  transitionPolls as apiTransitionPolls,
  getPrinterStatus,
  printFullReport,
  printReportSection,
} from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { LiveCheckButton } from '../components/live_check_button';
import { CastVoteRecordSyncRequiredModal } from './cast_vote_record_sync_required_screen';
import { ReprintReportButton } from '../components/reprint_report_button';
import { getCurrentTime } from '../utils/get_current_time';
import { PollWorkerLegacyPrintFlow } from './poll_worker_legacy_print_flow';
import { PollWorkerFujitsuPrintFlow } from './poll_worker_fujitsu_print_flow';

type PollWorkerFlowState =
  | {
      type: 'open-polls-prompt';
    }
  | {
      type: 'close-polls-prompt';
    }
  | {
      type: 'polls-transitioning';
    }
  | {
      type: 'printing';
    }
  | {
      type: 'post-print-flow';
      scheme: 'hardware-v4';
      result: FujitsuPrintResult;
    }
  | {
      type: 'post-print-flow';
      scheme: 'hardware-v3';
      numPages: number;
    };

function Screen(
  props: Omit<CenteredScreenProps, 'infoBarMode' | 'voterFacing'>
) {
  const { children } = props;

  return (
    <ScreenMainCenterChild infoBarMode="pollworker" voterFacing={false}>
      {children}
    </ScreenMainCenterChild>
  );
}

const BallotsAlreadyScannedScreen = (
  <Screen>
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
  scannedBallotCount: number;
  electionDefinition: ElectionDefinition;
  pollsInfo: PrecinctScannerPollsInfo;
  logger: BaseLogger;
}

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr 1fr;
`;

export function PollWorkerScreen({
  scannedBallotCount,
  electionDefinition,
  pollsInfo,
  logger,
}: PollWorkerScreenProps): JSX.Element {
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const transitionPollsMutation = apiTransitionPolls.useMutation();
  const exportCastVoteRecordsMutation =
    exportCastVoteRecordsToUsbDrive.useMutation();
  const printFullReportMutation = printFullReport.useMutation();
  const printReportSectionMutation = printReportSection.useMutation();
  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
  ] = useState(false);
  const [
    isCastVoteRecordSyncRequiredModalOpen,
    setIsCastVoteRecordSyncRequiredModalOpen,
  ] = useState(false);
  const { pollsState } = pollsInfo;

  function initialPollWorkerFlowState(): Optional<PollWorkerFlowState> {
    switch (pollsState) {
      case 'polls_closed_initial':
      case 'polls_paused':
        return { type: 'open-polls-prompt' };
      case 'polls_open':
        return { type: 'close-polls-prompt' };
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
          ...transitionPollsMutation.variables,
          ballotCount: scannedBallotCount,
        }
      : pollsInfo.pollsState !== 'polls_closed_initial'
      ? pollsInfo.lastPollsTransition
      : undefined;

  if (!usbDriveStatusQuery.isSuccess || !printerStatusQuery.isSuccess) {
    return (
      <Screen>
        <CenteredLargeProse>
          <Loading />
        </CenteredLargeProse>
      </Screen>
    );
  }

  const usbDriveStatus = usbDriveStatusQuery.data;
  const printerStatus = printerStatusQuery.data;
  const isPrinterReady =
    printerStatus &&
    ((printerStatus.scheme === 'hardware-v3' && printerStatus.connected) ||
      (printerStatus.scheme === 'hardware-v4' &&
        printerStatus.state === 'idle'));
  const needsToAttachPrinterToTransitionPolls = !isPrinterReady;

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function initiateReportPrinting() {
    if (printerStatus.scheme === 'hardware-v3') {
      const numPages = await printFullReportMutation.mutateAsync();
      setPollWorkerFlowState({
        type: 'post-print-flow',
        scheme: 'hardware-v3',
        numPages,
      });
    } else {
      const printResult = await printReportSectionMutation.mutateAsync({
        index: 0,
      });
      setPollWorkerFlowState({
        type: 'post-print-flow',
        scheme: 'hardware-v4',
        result: printResult,
      });
    }
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

      setPollWorkerFlowState({ type: 'polls-transitioning' });

      const pollsTransitionTime = getCurrentTime();
      await transitionPollsMutation.mutateAsync({
        type: pollsTransitionType,
        time: pollsTransitionTime,
      });

      if (pollsTransitionType === 'close_polls' && scannedBallotCount > 0) {
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
      await initiateReportPrinting();
    } catch (error) {
      await logger.log(
        getLogEventIdForPollsTransition(pollsTransitionType),
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
    if (usbDriveStatus.doesUsbDriveRequireCastVoteRecordSync) {
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

  if (isShowingBallotsAlreadyScannedScreen) {
    return BallotsAlreadyScannedScreen;
  }

  if (pollWorkerFlowState) {
    switch (pollWorkerFlowState.type) {
      case 'open-polls-prompt': {
      }
    }
  }
  if (pollWorkerFlowState?.type === 'open-polls-prompt') {
    const pollsTransition: PollsTransitionType =
      pollsState === 'polls_closed_initial' ? 'open_polls' : 'resume_voting';
    return (
      <Screen>
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
      </Screen>
    );
  }

  if (pollWorkerFlowState === 'close_polls_prompt') {
    return (
      <Screen>
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
      </Screen>
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
      <Screen>
        <LoadingAnimation />
        <CenteredLargeProse>
          <H1>{pollsTransitionProcessingText}</H1>
        </CenteredLargeProse>
      </Screen>
    );
  }

  if (
    pollWorkerFlowState === 'print_flow' ||
    pollWorkerFlowState === 'reprint_flow'
  ) {
    assert(lastPollsTransition);
    const isReprint = pollWorkerFlowState === 'reprint_flow';

    return printerStatus.scheme === 'hardware-v3' ? (
      <PollWorkerLegacyPrintFlow
        pollsTransitionType={lastPollsTransition.type}
        isReprint={isReprint}
      />
    ) : (
      <PollWorkerFujitsuPrintFlow
        electionDefinition={electionDefinition}
        pollsTransitionType={lastPollsTransition.type}
        isReprint={isReprint}
      />
    );
  }

  // compile-time check for completeness
  assertFalsy(pollWorkerFlowState);

  const commonActions = (
    <React.Fragment>
      {pollsInfo.pollsState !== 'polls_closed_initial' && (
        <ReprintReportButton
          scannedBallotCount={scannedBallotCount}
          lastPollsTransition={pollsInfo.lastPollsTransition}
          onPress={() => setPollWorkerFlowState('reprint_flow')}
        />
      )}
      <PowerDownButton />
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
    <Screen>
      <H1>Poll Worker Actions</H1>
      {content}
      {isCastVoteRecordSyncRequiredModalOpen && (
        <CastVoteRecordSyncRequiredModal
          blockedAction="close_polls"
          closeModal={() => setIsCastVoteRecordSyncRequiredModalOpen(false)}
        />
      )}
    </Screen>
  );
}

/* istanbul ignore next */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
