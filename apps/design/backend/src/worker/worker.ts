import { inspect } from 'node:util';
import { err, extractErrorMessage, Result, sleep } from '@votingworks/basics';

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
  let result: Result<unknown, unknown>;
  try {
    result = await processBackgroundTask(context, nextTask);
    await store.completeBackgroundTask(nextTask.id, result);
    if (result.isErr()) {
      console.log(
        `❌ Background task failed (${nextTask.id}):\n${inspect(result)}`
      );
      return { wasTaskProcessed: true };
    }
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    await store.completeBackgroundTask(nextTask.id, err(errorMessage));
    console.log(
      `❌ Background task panicked (${nextTask.id}):\n${errorMessage}\n${errorStack}`
    );
    return { wasTaskProcessed: true };
  }
  console.log(`✅ Finished processing background task ${nextTask.id}`);
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
