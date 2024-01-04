import { extractErrorMessage, sleep } from '@votingworks/basics';

import { Workspace } from '../workspace';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny(
  workspace: Workspace
): Promise<{ wasTaskProcessed: boolean }> {
  const { store } = workspace;

  const nextTask = store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    return { wasTaskProcessed: false };
  }

  /* eslint-disable no-console */
  store.startBackgroundTask(nextTask.id);
  console.log(`⏳ Processing background task ${nextTask.id}...`);
  try {
    await processBackgroundTask(workspace, nextTask);
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

export function start({ workspace }: { workspace: Workspace }): void {
  process.nextTick(async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { wasTaskProcessed } =
        await processNextBackgroundTaskIfAny(workspace);
      if (!wasTaskProcessed) {
        await sleep(1000);
      }
    }
  });
}
