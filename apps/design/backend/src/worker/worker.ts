import { extractErrorMessage, sleep } from '@votingworks/basics';

import { Store } from '../store';
import { processBackgroundTask } from './tasks';

async function processBackgroundTasks(store: Store): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const nextTask = store.getOldestQueuedBackgroundTask();

    if (!nextTask) {
      await sleep(1000);
      continue;
    }

    store.startBackgroundTask(nextTask.id);
    process.stdout.write(`⏳ Processing background task ${nextTask.id}...\n`);
    try {
      await processBackgroundTask(store, nextTask);
    } catch (error) {
      const errorMessage = extractErrorMessage(error);
      store.completeBackgroundTask(nextTask.id, errorMessage);
      process.stdout.write(
        `❌ Error processing background task ${nextTask.id}:\n${errorMessage}\n`
      );
      continue;
    }
    store.completeBackgroundTask(nextTask.id);
    process.stdout.write(
      `✅ Finished processing background task ${nextTask.id}\n`
    );
  }
}

export function start({ store }: { store: Store }): void {
  setTimeout(() => processBackgroundTasks(store));
}
