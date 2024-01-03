import { extractErrorMessage, sleep } from '@votingworks/basics';

import { Workspace } from '../workspace';
import { processBackgroundTask } from './tasks';

export async function processNextBackgroundTaskIfAny({
  log = console.log, // eslint-disable-line no-console
  workspace,
}: {
  log?: (text: string) => void;
  workspace: Workspace;
}): Promise<void> {
  const { store } = workspace;

  const nextTask = store.getOldestQueuedBackgroundTask();

  if (!nextTask) {
    await sleep(1000);
    return;
  }

  store.startBackgroundTask(nextTask.id);
  log(`⏳ Processing background task ${nextTask.id}...`);
  try {
    await processBackgroundTask(workspace, nextTask);
  } catch (error) {
    const errorMessage = extractErrorMessage(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    store.completeBackgroundTask(nextTask.id, errorMessage);
    log(
      `❌ Error processing background task ${nextTask.id}:\n${errorMessage}\n${errorStack}`
    );
    return;
  }
  store.completeBackgroundTask(nextTask.id);
  log(`✅ Finished processing background task ${nextTask.id}`);
}

export function start({ workspace }: { workspace: Workspace }): void {
  setTimeout(async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await processNextBackgroundTaskIfAny({ workspace });
    }
  });
}
