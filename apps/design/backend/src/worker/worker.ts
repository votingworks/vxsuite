import { assertDefined, extractErrorMessage, sleep } from '@votingworks/basics';

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
  // Requeue any tasks that were previously interrupted, say, because the worker process crashed
  await context.workspace.store.requeueInterruptedBackgroundTasks();

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
