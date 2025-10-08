import React, { useState } from 'react';

import {
  Button,
  Loading,
  LoadingAnimation,
  H1,
  P,
  PowerDownButton,
  FullScreenIconWrapper,
  Icons,
  SignedHashValidationButton,
  H6,
  Font,
  H5,
  QrCode,
} from '@votingworks/ui';
import { getPollsReportTitle } from '@votingworks/utils';
import {
  ElectionDefinition,
  doesPollsStateSupportLiveReporting,
  PollsTransitionType,
} from '@votingworks/types';
import { Optional, assert, throwIllegalValue } from '@votingworks/basics';
import styled from 'styled-components';
import type { PrecinctScannerPollsInfo } from '@votingworks/scan-backend';
import type { PrintResult } from '@votingworks/fujitsu-thermal-printer';
import {
  getUsbDriveStatus,
  printReportSection,
  getPrinterStatus,
  openPolls as openPollsApi,
  closePolls as closePollsApi,
  pauseVoting as pauseVotingApi,
  resumeVoting as resumeVotingApi,
  getPollsInfo,
  useApiClient,
  getConfig,
  getQuickResultsReportingUrl,
} from '../api';
import { FullScreenPromptLayout } from '../components/full_screen_prompt_layout';
import {
  PollsFlowPrinterSummary,
  getPollsFlowPrinterSummary,
} from '../utils/printer';
import { PostPrintScreen } from './poll_worker_post_print_screen';
import { Screen } from './poll_worker_shared';
import { CenteredText, Screen as PlainScreen } from '../components/layout';
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
      type: 'view-reporting-qr-code';
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
      <Icons.Warning color="warning" /> {printerSummary.alertText}
    </P>
  );
}

function UsbDriveAlertText(): JSX.Element {
  return (
    <P>
      <Icons.Warning color="warning" /> Insert a USB drive to continue.
    </P>
  );
}

function shouldAllowTogglingPolls(
  printerSummary: PollsFlowPrinterSummary,
  mustInsertUsbDriveToContinue: boolean
): boolean {
  return printerSummary.ready && !mustInsertUsbDriveToContinue;
}

function OpenPollsPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
  mustInsertUsbDriveToContinue,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
  mustInsertUsbDriveToContinue: boolean;
}): JSX.Element {
  return (
    <Screen>
      <CenteredText>
        <P>Do you want to open the polls?</P>
        <P>
          <Button onPress={onClose}>Menu</Button>{' '}
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={
              !shouldAllowTogglingPolls(
                printerSummary,
                mustInsertUsbDriveToContinue
              )
            }
          >
            Open Polls
          </Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
        {mustInsertUsbDriveToContinue && <UsbDriveAlertText />}
      </CenteredText>
    </Screen>
  );
}

function ResumeVotingPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
  mustInsertUsbDriveToContinue,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
  mustInsertUsbDriveToContinue: boolean;
}): JSX.Element {
  return (
    <Screen>
      <CenteredText>
        <P>Do you want to resume voting?</P>
        <P>
          <Button onPress={onClose}>Menu</Button>{' '}
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={
              !shouldAllowTogglingPolls(
                printerSummary,
                mustInsertUsbDriveToContinue
              )
            }
          >
            Resume Voting
          </Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
        {mustInsertUsbDriveToContinue && <UsbDriveAlertText />}
      </CenteredText>
    </Screen>
  );
}

function ClosePollsPromptScreen({
  onConfirm,
  onClose,
  printerSummary,
  mustInsertUsbDriveToContinue,
}: {
  onConfirm: () => void;
  onClose: () => void;
  printerSummary: PollsFlowPrinterSummary;
  mustInsertUsbDriveToContinue: boolean;
}): JSX.Element {
  return (
    <Screen>
      <CenteredText>
        <P>Do you want to close the polls?</P>
        <P>
          <Button onPress={onClose}>Menu</Button>{' '}
          <Button
            variant="primary"
            onPress={onConfirm}
            disabled={
              !shouldAllowTogglingPolls(
                printerSummary,
                mustInsertUsbDriveToContinue
              )
            }
          >
            Close Polls
          </Button>
        </P>
        <PrinterAlertText printerSummary={printerSummary} />
        {mustInsertUsbDriveToContinue && <UsbDriveAlertText />}
      </CenteredText>
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
    /* istanbul ignore next - compile-time check for completeness @preserve */
    default:
      throwIllegalValue(pollsTransitionType);
  }
}

export interface PollWorkerScreenProps {
  electionDefinition: ElectionDefinition;
  scannedBallotCount: number;
  startNewVoterSession: () => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  margin: 0 0.35rem 0.35rem;
`;

const ButtonGrid = styled.div`
  display: grid;
  grid-auto-rows: 1fr;
  grid-gap: max(${(p) => p.theme.sizes.minTouchAreaSeparationPx}px, 0.25rem);
  grid-template-columns: 1fr 1fr;
`;

function PollWorkerScreenContents({
  electionDefinition,
  pollsInfo,
  startNewVoterSession,
  scannedBallotCount,
}: PollWorkerScreenProps & {
  pollsInfo: PrecinctScannerPollsInfo;
}): JSX.Element {
  const apiClient = useApiClient();
  const pollsInfoQuery = getPollsInfo.useQuery();
  const configQuery = getConfig.useQuery();
  const usbDriveStatusQuery = getUsbDriveStatus.useQuery();
  const printerStatusQuery = getPrinterStatus.useQuery();
  const openPollsMutation = openPollsApi.useMutation();
  const closePollsMutation = closePollsApi.useMutation();
  const pauseVotingMutation = pauseVotingApi.useMutation();
  const resumeVotingMutation = resumeVotingApi.useMutation();
  const printReportSectionMutation = printReportSection.useMutation();
  const getQuickResultsReportingUrlQuery =
    getQuickResultsReportingUrl.useQuery();

  const [
    isShowingBallotsAlreadyScannedScreen,
    setIsShowingBallotsAlreadyScannedScreen,
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
    !pollsInfoQuery.isSuccess ||
    !configQuery.isSuccess
  ) {
    return (
      <Screen>
        <CenteredText>
          <Loading />
        </CenteredText>
      </Screen>
    );
  }

  const usbDriveStatus = usbDriveStatusQuery.data;
  const printerStatus = printerStatusQuery.data;
  const printerSummary = getPollsFlowPrinterSummary(printerStatus);
  const { pollsState } = pollsInfo;
  const { isContinuousExportEnabled } = configQuery.data;
  const mustInsertUsbDriveToContinue =
    isContinuousExportEnabled && usbDriveStatus.status !== 'mounted';

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

    const printResult = await printReportSectionMutation.mutateAsync({
      index: 0,
    });
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'open_polls',
      isAfterPollsTransition: true,
      printResult,
    });
  }

  async function closePolls() {
    assert(!mustInsertUsbDriveToContinue);
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'close_polls',
    });
    await closePollsMutation.mutateAsync();
    const printResult = await printReportSectionMutation.mutateAsync({
      index: 0,
    });
    setPollWorkerFlowState({
      type: 'post-print',
      transitionType: 'close_polls',
      isAfterPollsTransition: true,
      printResult,
    });
    startNewVoterSession();
  }

  async function pauseVoting() {
    setPollWorkerFlowState({
      type: 'polls-transitioning',
      transitionType: 'pause_voting',
    });
    await pauseVotingMutation.mutateAsync();
    const printResult = await printReportSectionMutation.mutateAsync({
      index: 0,
    });
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
    const printResult = await printReportSectionMutation.mutateAsync({
      index: 0,
    });
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
    const printResult = await printReportSectionMutation.mutateAsync({
      index: 0,
    });
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

  if (pollWorkerFlowState) {
    switch (pollWorkerFlowState.type) {
      case 'open-polls-prompt':
        return (
          <OpenPollsPromptScreen
            onConfirm={openPolls}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
            mustInsertUsbDriveToContinue={mustInsertUsbDriveToContinue}
          />
        );
      case 'resume-voting-prompt':
        return (
          <ResumeVotingPromptScreen
            onConfirm={resumeVoting}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
            mustInsertUsbDriveToContinue={mustInsertUsbDriveToContinue}
          />
        );
      case 'close-polls-prompt':
        return (
          <ClosePollsPromptScreen
            onConfirm={closePolls}
            onClose={showAllPollWorkerActions}
            printerSummary={printerSummary}
            mustInsertUsbDriveToContinue={mustInsertUsbDriveToContinue}
          />
        );
      case 'polls-transitioning':
        return (
          <Screen>
            <LoadingAnimation />
            <CenteredText>
              <H1>
                {getPollsTransitioningText(pollWorkerFlowState.transitionType)}
              </H1>
            </CenteredText>
          </Screen>
        );
      case 'printing-report':
        return (
          <Screen>
            <LoadingAnimation />
            <CenteredText>
              <H1>Printing Report…</H1>
            </CenteredText>
          </Screen>
        );
      case 'view-reporting-qr-code': {
        assert(doesPollsStateSupportLiveReporting(pollsInfo.pollsState));
        // @ts-expect-error: Redundant check to satisfy TypeScript issue with accessing lastPollsTransition
        assert(pollsInfo.pollsState !== 'polls_closed_initial');
        return (
          <Screen>
            <h4 style={{ marginTop: 0 }}>
              Scan the QR code to send{' '}
              {getPollsReportTitle(pollsInfo.lastPollsTransition.type)}
            </h4>
            <CenteredText>
              {getQuickResultsReportingUrlQuery.data && (
                <div data-testid="quick-results-code">
                  <QrCode
                    value={getQuickResultsReportingUrlQuery.data}
                    level="L"
                    size={450}
                  />
                </div>
              )}
              <br />
              <Button onPress={showAllPollWorkerActions}>Done</Button>
            </CenteredText>
          </Screen>
        );
      }
      case 'post-print':
        return (
          <PostPrintScreen
            isPostPollsTransition={pollWorkerFlowState.isAfterPollsTransition}
            pollsTransitionType={pollWorkerFlowState.transitionType}
            electionDefinition={electionDefinition}
            initialPrintResult={pollWorkerFlowState.printResult}
            reportQuickResultsEnabled={!!getQuickResultsReportingUrlQuery.data}
            onViewReportResults={() =>
              setPollWorkerFlowState({ type: 'view-reporting-qr-code' })
            }
          />
        );
      /* istanbul ignore next - compile-time check for completeness @preserve */
      default:
        throwIllegalValue(pollWorkerFlowState, 'state');
    }
  }

  const viewQrReportButton =
    getQuickResultsReportingUrlQuery.data &&
    doesPollsStateSupportLiveReporting(pollsInfo.pollsState) &&
    // @ts-expect-error: Redundant check to satisfy TypeScript issue with accessing lastPollsTransition
    pollsInfo.pollsState !== 'polls_closed_initial' ? (
      <Button
        onPress={() =>
          setPollWorkerFlowState({ type: 'view-reporting-qr-code' })
        }
      >
        {`Send ${getPollsReportTitle(pollsInfo.lastPollsTransition.type)}`}
      </Button>
    ) : null;

  const commonActions = (
    <React.Fragment>
      {pollsInfo.pollsState !== 'polls_closed_initial' && (
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
      )}
      {viewQrReportButton}
      <SignedHashValidationButton apiClient={apiClient} />
      <PowerDownButton />
    </React.Fragment>
  );

  const content = (() => {
    switch (pollsState) {
      case 'polls_closed_initial':
        return (
          <Container>
            <P>
              The polls are <Font weight="bold">closed</Font>. Open the polls to
              begin voting.
            </P>
            <ButtonGrid>
              <Button
                variant="primary"
                onPress={openPolls}
                disabled={
                  !shouldAllowTogglingPolls(
                    printerSummary,
                    mustInsertUsbDriveToContinue
                  )
                }
              >
                Open Polls
              </Button>
            </ButtonGrid>
            <H5>Other Actions</H5>
            <ButtonGrid>{commonActions}</ButtonGrid>
          </Container>
        );
      case 'polls_open':
        // Do not disable Pausing Voting if shouldAllowTogglingPolls is false as in the unlikely event of an internal connection failure
        // officials may want to pause voting on the machine.
        return (
          <Container>
            <P>
              The polls are <Font weight="bold">open</Font>. Close the polls to
              end voting.
            </P>
            <ButtonGrid>
              <Button
                variant="primary"
                onPress={closePolls}
                disabled={
                  !shouldAllowTogglingPolls(
                    printerSummary,
                    mustInsertUsbDriveToContinue
                  )
                }
              >
                Close Polls
              </Button>
            </ButtonGrid>
            <H5>Other Actions</H5>
            <ButtonGrid>
              <Button onPress={pauseVoting}>Pause Voting</Button>
              {commonActions}
            </ButtonGrid>
          </Container>
        );
      case 'polls_paused':
        return (
          <Container>
            <P>
              Voting is <Font weight="bold">paused</Font>.
            </P>
            <ButtonGrid>
              <Button
                variant="primary"
                onPress={resumeVoting}
                disabled={
                  !shouldAllowTogglingPolls(
                    printerSummary,
                    mustInsertUsbDriveToContinue
                  )
                }
              >
                Resume Voting
              </Button>
            </ButtonGrid>
            <H6>Other Actions</H6>
            <ButtonGrid>
              <Button
                onPress={closePolls}
                disabled={
                  !shouldAllowTogglingPolls(
                    printerSummary,
                    mustInsertUsbDriveToContinue
                  )
                }
              >
                Close Polls
              </Button>
              {commonActions}
            </ButtonGrid>
          </Container>
        );
      case 'polls_closed_final':
        return (
          <Container>
            <P>
              Polls are <Font weight="bold">closed</Font>. Voting is complete
              and the polls cannot be reopened.
            </P>
            <ButtonGrid>{commonActions}</ButtonGrid>
          </Container>
        );
      /* istanbul ignore next - compile-time check for completeness @preserve */
      default:
        throwIllegalValue(pollsState);
    }
  })();

  return (
    <PlainScreen
      title="Poll Worker Menu"
      infoBarMode="admin"
      voterFacing={false}
      showTestModeBanner={false}
    >
      {content}
    </PlainScreen>
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

/* istanbul ignore next - @preserve */
export function BallotsAlreadyScannedScreenPreview(): JSX.Element {
  return BallotsAlreadyScannedScreen;
}
