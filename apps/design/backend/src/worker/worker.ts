import { extractErrorMessage, sleep } from '@votingworks/basics';

import { WorkerContext } from './context';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny(
  context: WorkerContext
): Promise<{ wasTaskProcessed: boolean }> {
  const { store } = context.workspace;

  const nextTask = store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    return { wasTaskProcessed: false };
  }

  /* eslint-disable no-console */
  store.startBackgroundTask(nextTask.id);
  console.log(`⏳ Processing background task ${nextTask.id}...`);
  try {
    await processBackgroundTask(context, nextTask);
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    store.completeBackgroundTask(nextTask.id, errorMessage);
    console.log(
      `❌ Error processing background task ${nextTask.id}:\n${errorMessage}\n${errorStack}`
    );
    return { wasTaskProcessed: true };
  }
  store.completeBackgroundTask(nextTask.id);
  console.log(`✅ Finished processing background task ${nextTask.id}`);
  return { wasTaskProcessed: true };
  /* eslint-enable no-console */
}

/**
 * Starts the VxDesign background worker. Note that, as currently implemented, it's only safe to
 * run one instance of the worker.
 */
export function start(context: WorkerContext): void {
  // Requeue any tasks that were previously interrupted, say, because the worker process crashed
  context.workspace.store.requeueInterruptedBackgroundTasks();

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
