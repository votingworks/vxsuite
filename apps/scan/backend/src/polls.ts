import { Result, assert, err, ok } from '@votingworks/basics';
import { LogEventId, Logger } from '@votingworks/logging';
import { UsbDrive } from '@votingworks/usb-drive';
import { Store } from './store';
import { exportCastVoteRecordsToUsbDrive } from './export';
import { Workspace } from './util/workspace';
import { getCurrentTime } from './util/get_current_time';

export type OpenPollsResult = Result<void, 'ballots-already-scanned'>;

export async function openPolls({
  store,
  logger,
}: {
  store: Store;
  logger: Logger;
}): Promise<OpenPollsResult> {
  const previousPollsState = store.getPollsState();
  assert(previousPollsState === 'polls_closed_initial');

  // Confirm there are no scanned ballots before opening polls, in compliance
  // with VVSG 2.0 1.1.3-B, even though it should be an impossible app state.
  const sheetCount = store.getBallotsCounted();
  if (sheetCount > 0) {
    await logger.logAsCurrentRole(LogEventId.PollsOpened, {
      disposition: 'failure',
      message:
        'User prevented from opening polls because ballots have already been scanned.',
      sheetCount,
    });
    return err('ballots-already-scanned');
  }

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

  return ok();
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
    const exportResult = await exportCastVoteRecordsToUsbDrive({
      mode: 'polls_closing',
      workspace,
      usbDrive,
      logger,
    });
    exportResult.assertOk(
      'Failed to finish cast vote record export to USB drive.'
    );
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
