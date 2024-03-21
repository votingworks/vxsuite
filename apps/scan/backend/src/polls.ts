import { assert } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Store } from './store';
import { exportCastVoteRecordsToUsbDrive } from './export';
import { Workspace } from './util/workspace';
import { getCurrentTime } from './util/get_current_time';

export async function openPolls({
  store,
  logger,
}: {
  store: Store;
  logger: Logger;
}): Promise<void> {
  const previousPollsState = store.getPollsState();
  const ballotsCounted = store.getBallotsCounted();
  assert(previousPollsState === 'polls_closed_initial');
  assert(ballotsCounted === 0);

  store.transitionPolls({ type: 'open_polls', time: getCurrentTime() });
  await logger.logAsCurrentRole(LogEventId.PollsOpened, {
    disposition: 'success',
    message: 'User opened the polls.',
  });

  const batchId = store.addBatch();
  await logger.log(LogEventId.ScannerBatchStarted, 'system', {
    disposition: 'success',
    message: 'New scanning batch started on polls opened.',
    batchId,
  });
}

export async function closePolls({
  workspace,
  usbDrive,
  logger,
}: {
  workspace: Workspace;
  usbDrive: UsbDrive;
  logger: Logger;
}): Promise<void> {
  const { store } = workspace;

  const previousPollsState = store.getPollsState();
  assert(
    previousPollsState === 'polls_open' || previousPollsState === 'polls_paused'
  );

  store.transitionPolls({ type: 'close_polls', time: getCurrentTime() });
  await logger.logAsCurrentRole(LogEventId.PollsClosed, {
    disposition: 'success',
    message: 'User closed the polls.',
  });

  if (previousPollsState === 'polls_open') {
    const ongoingBatchId = store.getOngoingBatchId();
    assert(ongoingBatchId !== undefined);
    store.finishBatch({ batchId: ongoingBatchId });
    await logger.log(LogEventId.ScannerBatchEnded, 'system', {
      disposition: 'success',
      message: 'Current scanning batch finished on polls closed.',
      batchId: ongoingBatchId,
    });
  }

  const ballotsCounted = store.getBallotsCounted();
  if (ballotsCounted > 0) {
    void (await exportCastVoteRecordsToUsbDrive({
      mode: 'polls_closing',
      workspace,
      usbDrive,
      logger,
    }));
  }
}

export async function pauseVoting({
  store,
  logger,
}: {
  store: Store;
  logger: Logger;
}): Promise<void> {
  const previousPollsState = store.getPollsState();
  assert(previousPollsState === 'polls_open');

  store.transitionPolls({ type: 'pause_voting', time: getCurrentTime() });
  await logger.logAsCurrentRole(LogEventId.VotingPaused, {
    disposition: 'success',
    message: 'User paused voting.',
  });

  const ongoingBatchId = store.getOngoingBatchId();
  assert(ongoingBatchId !== undefined);
  store.finishBatch({ batchId: ongoingBatchId });
  await logger.log(LogEventId.ScannerBatchEnded, 'system', {
    disposition: 'success',
    message: 'Current scanning batch finished on voting paused.',
    batchId: ongoingBatchId,
  });
}

export async function resumeVoting({
  store,
  logger,
}: {
  store: Store;
  logger: Logger;
}): Promise<void> {
  const previousPollsState = store.getPollsState();
  assert(previousPollsState === 'polls_paused');

  store.transitionPolls({ type: 'resume_voting', time: getCurrentTime() });
  await logger.logAsCurrentRole(LogEventId.VotingResumed, {
    disposition: 'success',
    message: 'User resumed voting.',
  });

  const batchId = store.addBatch();
  await logger.log(LogEventId.ScannerBatchStarted, 'system', {
    disposition: 'success',
    message: 'New scanning batch started on voting resumed.',
    batchId,
  });
}

export async function resetPollsToPaused({
  store,
  logger,
}: {
  store: Store;
  logger: Logger;
}): Promise<void> {
  const previousPollsState = store.getPollsState();
  assert(previousPollsState === 'polls_closed_final');
  store.transitionPolls({ type: 'pause_voting', time: getCurrentTime() });
  await logger.logAsCurrentRole(LogEventId.ResetPollsToPaused, {
    disposition: 'success',
    message: 'User reset the polls to paused.',
  });
}
