import { extractErrorMessage, sleep } from '@votingworks/basics';

import { BackgroundTask, Store } from '../store';

async function processBackgroundTask(
  _store: Store, // eslint-disable-line @typescript-eslint/no-unused-vars
  _task: BackgroundTask // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  // Simulate a long-running operation
  // TODO(arsalan): Implement actual processing logic
  await sleep(3000);
}

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
