/* eslint-disable no-console */

import { assertDefined, extractErrorMessage, sleep } from '@votingworks/basics';
import * as Sentry from '@sentry/node';

import type { WorkerContext } from './context.js';
import { processBackgroundTask } from './tasks.js';

export async function processNextBackgroundTaskIfAny(
  context: WorkerContext
): Promise<{ wasTaskProcessed: boolean }> {
  const { store } = context.workspace;

  const nextTask = await store.tasks.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    return { wasTaskProcessed: false };
  }

  await store.tasks.startBackgroundTask(nextTask.id);
  console.log(`⏳ Processing background task ${nextTask.id}...`);
  try {
    await processBackgroundTask(context, nextTask);
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    await store.tasks.completeBackgroundTask(nextTask.id, errorMessage);
    console.log(
      `❌ Error processing background task ${nextTask.id}:\n${errorMessage}\n${errorStack}`
    );
    return { wasTaskProcessed: true };
  }
  await store.tasks.completeBackgroundTask(nextTask.id);
  const completedTask = assertDefined(
    await store.tasks.getBackgroundTask(nextTask.id)
  );
  const durationSeconds =
    (assertDefined(completedTask.completedAt).getTime() -
      assertDefined(completedTask.startedAt).getTime()) /
    1_000;
  console.log(
    `✅ Finished processing background task ${nextTask.id} (${durationSeconds}s)`
  );
  return { wasTaskProcessed: true };
}

/**
 * Starts the VxHub background worker. Note that, as currently implemented, it's only safe to
 * run one instance of the worker.
 */
export async function start(
  context: WorkerContext,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const { store } = context.workspace;

  async function handleSigterm() {
    console.log('Received SIGTERM, marking graceful shutdown...');
    try {
      await store.tasks.markRunningTaskAsGracefullyInterrupted();
      console.log('Marked running task as gracefully interrupted');
      console.log('Graceful shutdown complete, exiting...');
    } catch (error) {
      // @coverage-defer
      console.error('Error during graceful shutdown:', error);
    }
    process.exit(0);
  }

  process.on('SIGTERM', handleSigterm);

  const crashedTaskIds = await store.tasks.failCrashedBackgroundTasks();

  if (crashedTaskIds.length > 0) {
    console.warn(
      `⚠️  Worker starting with ${
        crashedTaskIds.length
      } crashed task(s) that will NOT be requeued: ${crashedTaskIds.join(', ')}`
    );

    // Report to Sentry for monitoring
    Sentry.captureMessage(
      'Background worker found crashed task(s) on startup',
      {
        level: 'warning',
        extra: {
          crashedTaskIds,
        },
      }
    );
  }

  const requeuedTaskIds =
    await store.tasks.requeueGracefullyInterruptedBackgroundTasks();
  if (requeuedTaskIds.length > 0) {
    console.log(
      `🔄 Requeued ${
        requeuedTaskIds.length
      } gracefully interrupted task(s): ${requeuedTaskIds.join(', ')}`
    );
  }

  while (!options?.signal?.aborted) {
    const { wasTaskProcessed } = await processNextBackgroundTaskIfAny(context);
    // @coverage-defer
    if (!wasTaskProcessed) {
      await sleep(1000);
    }
  }

  process.off('SIGTERM', handleSigterm);
}
