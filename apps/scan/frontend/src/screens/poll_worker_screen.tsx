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
  getPollsReportTitle,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { ElectionDefinition, PollsTransitionType } from '@votingworks/types';
import { Optional, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import type {
  PrecinctScannerPollsInfo,
  PrintResult,
} from '@votingworks/scan-backend';
import {
  getUsbDriveStatus,
  printReport,
  getPrinterStatus,
  openPolls as openPollsApi,
  closePolls as closePollsApi,
  pauseVoting as pauseVotingApi,
  resumeVoting as resumeVotingApi,
  getPollsInfo,
} from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import { LiveCheckButton } from '../components/live_check_button';
import { CastVoteRecordSyncRequiredScreen } from './cast_vote_record_sync_required_screen';
import {
  PollsFlowPrinterSummary,
  getPollsFlowPrinterSummary,
} from '../utils/printer';
import { LegacyPostPrintScreen } from './poll_worker_legacy_post_print_screen';
import { FujitsuPostPrintScreen } from './poll_worker_fujitsu_post_print_screen';
import { Screen } from './poll_worker_shared';
import { PollWorkerLoadAndReprintButton } from '../components/printer_management/poll_worker_load_and_reprint_button';

type PollWorkerFlowState =
  | {
      type: 'open-polls-prompt';
    }
  | {
      type: 'resume-voting-prompt';
    }
  | {
      type: 'close-polls-prompt';
    }
  | {
      type: 'polls-transitioning';
      transitionType: PollsTransitionType;
    }
  | {
      type: 'printing-report';
    }
  | {
      type: 'post-print';
      transitionType: PollsTransitionType;
      isAfterPollsTransition: boolean;
      printResult: PrintResult;
    };

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

function PrinterAlertText({
  printerSummary,
}: {
  printerSummary: PollsFlowPrinterSummary;
}): JSX.Element | null {
  if (printerSummary.ready) {
    return null;
  }
  return (
    <P>
      <Icons.Warning /> {printerSummary.alertText}
    </P>
  );
}

function OpenPollsPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
}): JSX.Element {
  return (
    <Screen>
      <CenteredLargeProse>
        <P>Do you want to open the polls?</P>
        <P>
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={!printerSummary.ready}
          >
            Yes, Open the Polls
          </Button>{' '}
          <Button onPress={onClose}>No</Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
      </CenteredLargeProse>
    </Screen>
  );
}

function ResumeVotingPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
}): JSX.Element {
  return (
    <Screen>
      <CenteredLargeProse>
        <P>Do you want to resume voting?</P>
        <P>
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={!printerSummary.ready}
          >
            Yes, Resume Voting
          </Button>{' '}
          <Button onPress={onClose}>No</Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
      </CenteredLargeProse>
    </Screen>
  );
}

function ClosePollsPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
}): JSX.Element {
  return (
    <Screen>
      <CenteredLargeProse>
        <P>Do you want to close the polls?</P>
        <P>
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={!printerSummary.ready}
          >
            Yes, Close the Polls
          </Button>{' '}
          <Button onPress={onClose}>No</Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
      </CenteredLargeProse>
    </Screen>
  );
}

function getPollsTransitioningText(pollsTransitionType: PollsTransitionType) {
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
}

export interface PollWorkerScreenProps {
  electionDefinition: ElectionDefinition;
  scannedBallotCount: number;
}

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr 1fr;
`;

function PollWorkerScreenContents({
  electionDefinition,
  pollsInfo,
  scannedBallotCount,
}: PollWorkerScreenProps & {
  pollsInfo: PrecinctScannerPollsInfo;
}): JSX.Element {
  const pollsInfoQuery = getPollsInfo.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const openPollsMutation = openPollsApi.useMutation();
  const closePollsMutation = closePollsApi.useMutation();
  const pauseVotingMutation = pauseVotingApi.useMutation();
  const resumeVotingMutation = resumeVotingApi.useMutation();
  const printReportMutation = printReport.useMutation();

  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
  ] = useState(false);
  const [
    shouldStayOnCastVoteRecordSyncRequiredScreen,
    setShouldStayOnCastVoteRecordSyncRequiredScreen,
  ] = useState(false);

  function initialPollWorkerFlowState(): Optional<PollWorkerFlowState> {
    switch (pollsInfo.pollsState) {
      case 'polls_closed_initial':
        return { type: 'open-polls-prompt' };
      case 'polls_paused':
        return { type: 'resume-voting-prompt' };
      case 'polls_open':
        return { type: 'close-polls-prompt' };
      default:
        return undefined;
    }
  }

  const [pollWorkerFlowState, setPollWorkerFlowState] = useState<
    Optional<PollWorkerFlowState>
  >(initialPollWorkerFlowState());

  if (
    !usbDriveStatusQuery.isSuccess ||
    !printerStatusQuery.isSuccess ||
    !pollsInfoQuery.isSuccess
  ) {
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
  const printerSummary = getPollsFlowPrinterSummary(printerStatus);
  const { pollsState } = pollsInfo;

  function showAllPollWorkerActions() {
    return setPollWorkerFlowState(undefined);
  }

  async function openPolls() {
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'open_polls',
    });

    const openPollsResult = await openPollsMutation.mutateAsync();
    if (openPollsResult.isErr()) {
      // VVSG 2.0 1.1.3-B.2: Alert poll worker to non-zero scan count.
      setIsShowingBallotsAlreadyScannedScreen(true);
      return;
    }

    const printResult = await printReportMutation.mutateAsync();
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'open_polls',
      isAfterPollsTransition: true,
      printResult,
    });
  }

  async function closePolls() {
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'close_polls',
    });
    await closePollsMutation.mutateAsync();
    const printResult = await printReportMutation.mutateAsync();
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'close_polls',
      isAfterPollsTransition: true,
      printResult,
    });
  }

  async function pauseVoting() {
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'pause_voting',
    });
    await pauseVotingMutation.mutateAsync();
    const printResult = await printReportMutation.mutateAsync();
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'pause_voting',
      isAfterPollsTransition: true,
      printResult,
    });
  }

  async function resumeVoting() {
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'resume_voting',
    });
    await resumeVotingMutation.mutateAsync();
    const printResult = await printReportMutation.mutateAsync();
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'resume_voting',
      isAfterPollsTransition: true,
      printResult,
    });
  }

  async function reprintReport({
    isAfterPollsTransition,
    transitionType,
  }: {
    isAfterPollsTransition: boolean;
    transitionType: PollsTransitionType;
  }) {
    setPollWorkerFlowState({
      type: 'printing-report',
    });
    const printResult = await printReportMutation.mutateAsync();
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType,
      isAfterPollsTransition,
      printResult,
    });
  }

  const allowReprintingReport =
    pollsInfo.pollsState !== 'polls_closed_initial' &&
    pollsInfo.lastPollsTransition.ballotCount === scannedBallotCount;

  if (isShowingBallotsAlreadyScannedScreen) {
    return BallotsAlreadyScannedScreen;
  }

  if (
    usbDriveStatus.doesUsbDriveRequireCastVoteRecordSync ||
    // This ensures that we don't immediately transition away from the CVR sync success message.
    // We can't rely on doesUsbDriveRequireCastVoteRecordSync because it becomes false as soon as
    // the sync completes.
    shouldStayOnCastVoteRecordSyncRequiredScreen
  ) {
    return (
      <CastVoteRecordSyncRequiredScreen
        setShouldStayOnCastVoteRecordSyncRequiredScreen={
          setShouldStayOnCastVoteRecordSyncRequiredScreen
        }
      />
    );
  }

  if (pollWorkerFlowState) {
    switch (pollWorkerFlowState.type) {
      case 'open-polls-prompt':
        return (
          <OpenPollsPromptScreen
            onConfirm={openPolls}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
          />
        );
      case 'resume-voting-prompt':
        return (
          <ResumeVotingPromptScreen
            onConfirm={resumeVoting}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
          />
        );
      case 'close-polls-prompt':
        return (
          <ClosePollsPromptScreen
            onConfirm={closePolls}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
          />
        );
      case 'polls-transitioning':
        return (
          <Screen>
            <LoadingAnimation />
            <CenteredLargeProse>
              <H1>
                {getPollsTransitioningText(pollWorkerFlowState.transitionType)}
              </H1>
            </CenteredLargeProse>
          </Screen>
        );
      case 'printing-report':
        return (
          <Screen>
            <LoadingAnimation />
            <CenteredLargeProse>
              <H1>Printing Report…</H1>
            </CenteredLargeProse>
          </Screen>
        );
      case 'post-print':
        if (pollWorkerFlowState.printResult.scheme === 'hardware-v3') {
          return (
            <LegacyPostPrintScreen
              isPostPollsTransition={pollWorkerFlowState.isAfterPollsTransition}
              numPages={pollWorkerFlowState.printResult.pageCount}
              transitionType={pollWorkerFlowState.transitionType}
            />
          );
        }
        return (
          <FujitsuPostPrintScreen
            isPostPollsTransition={pollWorkerFlowState.isAfterPollsTransition}
            pollsTransitionType={pollWorkerFlowState.transitionType}
            electionDefinition={electionDefinition}
            initialPrintResult={pollWorkerFlowState.printResult.result}
          />
        );
      /* istanbul ignore next - compile-time check for completeness */
      default:
        throwIllegalValue(pollWorkerFlowState, 'state');
    }
  }

  const commonActions = (
    <React.Fragment>
      {pollsInfo.pollsState !== 'polls_closed_initial' &&
        (printerStatus.scheme === 'hardware-v4' ? (
          <PollWorkerLoadAndReprintButton
            reprint={() =>
              reprintReport({
                isAfterPollsTransition: false,
                transitionType: pollsInfo.lastPollsTransition.type,
              })
            }
            reprintText={`Print ${getPollsReportTitle(
              pollsInfo.lastPollsTransition.type
            )}`}
            disablePrinting={!allowReprintingReport}
            loadPaperText="Load Printer Paper"
          />
        ) : (
          <Button
            onPress={() =>
              reprintReport({
                isAfterPollsTransition: false,
                transitionType: pollsInfo.lastPollsTransition.type,
              })
            }
            disabled={!allowReprintingReport || !printerSummary.ready}
          >
            Print {getPollsReportTitle(pollsInfo.lastPollsTransition.type)}
          </Button>
        ))}
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
    </Screen>
  );
}

export function PollWorkerScreen(
  props: PollWorkerScreenProps
): JSX.Element | null {
  const pollsInfoQuery = getPollsInfo.useQuery();

  if (!pollsInfoQuery.isSuccess) {
    return null;
  }
  return (
    <PollWorkerScreenContents {...props} pollsInfo={pollsInfoQuery.data} />
  );
}

/* istanbul ignore next */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
