import { assertDefined, extractErrorMessage, sleep } from '@votingworks/basics';
import * as Sentry from '@sentry/node';

import { WorkerContext } from './context';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny(
  context: WorkerContext
): Promise<{ wasTaskProcessed: boolean }> {
  const { store } = context.workspace;

  const nextTask = await store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    return { wasTaskProcessed: false };
  }

  /* eslint-disable no-console */
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
  /* eslint-enable no-console */
}

/**
 * Starts the VxDesign background worker. Note that, as currently implemented, it's only safe to
 * run one instance of the worker.
 */
export async function start(context: WorkerContext): Promise<void> {
  const { store } = context.workspace;

  /* eslint-disable no-console */

  // Check for interrupted tasks on startup
  const interruptedTasks = await store.getInterruptedBackgroundTasks();

  // Log and report any tasks that were killed non-gracefully (crashed)
  if (interruptedTasks.nonGraceful.length > 0) {
    const crashedTaskIds = interruptedTasks.nonGraceful.map((task) => task.id);
    console.warn(
      `⚠️  Worker starting with ${crashedTaskIds.length} crashed task(s) that will NOT be requeued: ${crashedTaskIds.join(', ')}`
    );

    // Report to Sentry for monitoring
    Sentry.captureMessage(
      `Background worker found ${crashedTaskIds.length} crashed task(s) on startup`,
      {
        level: 'warning',
        tags: {
          component: 'background-worker',
          event: 'crashed-tasks-detected',
        },
        extra: {
          crashedTaskIds,
          crashedTasks: interruptedTasks.nonGraceful.map((task) => ({
            id: task.id,
            taskName: task.taskName,
            startedAt: task.startedAt,
          })),
        },
      }
    );
  }

  // Requeue any tasks that were interrupted due to graceful shutdown
  const requeuedTasks = await store.requeueGracefullyInterruptedBackgroundTasks();
  if (requeuedTasks.length > 0) {
    const requeuedTaskIds = requeuedTasks.map((task) => task.id);
    console.log(
      `🔄 Requeued ${requeuedTaskIds.length} gracefully interrupted task(s): ${requeuedTaskIds.join(', ')}`
    );
  }

  // Set up SIGTERM handler to mark graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, marking graceful shutdown...');
    try {
      const runningTask = await store.markRunningTaskAsGracefullyInterrupted();
      if (runningTask) {
        console.log(`Marked task ${runningTask.id} as gracefully interrupted`);
      }
      console.log('Graceful shutdown complete, exiting...');
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
    }
    process.exit(0);
  });

  /* eslint-enable no-console */

  process.nextTick(async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { wasTaskProcessed } =
        await processNextBackgroundTaskIfAny(context);
      if (!wasTaskProcessed) {
        await sleep(1000);
      }
    }
  });
}
