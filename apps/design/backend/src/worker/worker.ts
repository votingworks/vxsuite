import { extractErrorMessage, sleep } from '@votingworks/basics';

import { Workspace } from '../workspace';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny(
  workspace: Workspace
): Promise<void> {
  const { store } = workspace;

  const nextTask = store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    await sleep(1000);
    return;
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
    return;
  }
  store.completeBackgroundTask(nextTask.id);
  console.log(`✅ Finished processing background task ${nextTask.id}`);
  /* eslint-enable no-console */
}

export function start({ workspace }: { workspace: Workspace }): void {
  setTimeout(async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await processNextBackgroundTaskIfAny(workspace);
    }
  });
}
