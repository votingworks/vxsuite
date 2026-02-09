/* eslint-disable no-console */

import { assertDefined, extractErrorMessage, sleep } from '@votingworks/basics';
import * as Sentry from '@sentry/node';

import { WorkerContext } from './context';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny(
  context: WorkerContext,
  onTaskStarted?: (taskId: string) => void
): Promise<{ wasTaskProcessed: boolean }> {
  const { store } = context.workspace;

  const nextTask = await store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    return { wasTaskProcessed: false };
  }

  onTaskStarted?.(nextTask.id);

  await store.startBackgroundTask(nextTask.id);
  console.log(`⏳ Processing background task ${nextTask.id}...`);
  try {
    await processBackgroundTask(context, nextTask);
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    await store.completeBackgroundTask(nextTask.id, errorMessage);
    console.log(
      `❌ Error processing background task ${nextTask.id}:\n${errorMessage}\n${errorStack}`
    );
    return { wasTaskProcessed: true };
  }
  await store.completeBackgroundTask(nextTask.id);
  const completedTask = assertDefined(
    await store.getBackgroundTask(nextTask.id)
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
 * Starts the VxDesign background worker. Note that, as currently implemented, it's only safe to
 * run one instance of the worker.
 */
export async function start(
  context: WorkerContext,
  options?: { signal?: AbortSignal }
): Promise<void> {
  const { store } = context.workspace;

  // Track the currently running task for graceful shutdown
  let currentTaskId: string | undefined;

  async function handleSigterm() {
    console.log('Received SIGTERM, marking graceful shutdown...');
    try {
      if (currentTaskId) {
        await store.markTaskAsGracefullyInterrupted(currentTaskId);
        console.log(`Marked task ${currentTaskId} as gracefully interrupted`);
      }
      console.log('Graceful shutdown complete, exiting...');
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
    }
    process.exit(0);
  }

  process.on('SIGTERM', handleSigterm);

  const crashedTasks = await store.failCrashedBackgroundTasks();

  if (crashedTasks.length > 0) {
    const crashedTaskIds = crashedTasks.map((task) => task.id);
    console.warn(
      `⚠️  Worker starting with ${crashedTaskIds.length
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
    await store.requeueGracefullyInterruptedBackgroundTasks();
  if (requeuedTaskIds.length > 0) {
    console.log(
      `🔄 Requeued ${requeuedTaskIds.length
      } gracefully interrupted task(s): ${requeuedTaskIds.join(', ')}`
    );
  }

  while (!options?.signal?.aborted) {
    const { wasTaskProcessed } = await processNextBackgroundTaskIfAny(
      context,
      // eslint-disable-next-line no-loop-func
      (taskId) => {
        currentTaskId = taskId;
      }
    );
    if (!wasTaskProcessed) {
      await sleep(1000);
    } else {
      currentTaskId = undefined;
    }
  }

  process.off('SIGTERM', handleSigterm);
}
