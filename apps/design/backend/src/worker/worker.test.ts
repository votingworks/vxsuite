import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
  makeMockGoogleCloudTextToSpeechClient,
  makeMockGoogleCloudTranslationClient,
} from '@votingworks/backend';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import * as tasks from './tasks';
import { processNextBackgroundTaskIfAny, start } from './worker';
import { WorkerContext } from './context';
import { TestStore } from '../../test/test_store';

vi.mock('./tasks');

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);
const store = testStore.getStore();

const processBackgroundTaskMock = vi.mocked(tasks.processBackgroundTask);

function createMockContext(): WorkerContext {
  const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
    fn: vi.fn,
  });
  const mockSynthesizer = new GoogleCloudSpeechSynthesizer({
    textToSpeechClient,
  });
  const translationClient = makeMockGoogleCloudTranslationClient({
    fn: vi.fn,
  });
  const mockTranslator = new GoogleCloudTranslator({ translationClient });

  return {
    workspace: {
      assetDirectoryPath: makeTemporaryDirectory(),
      store,
    },
    fileStorageClient: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
    speechSynthesizer: mockSynthesizer,
    translator: mockTranslator,
    logger: mockBaseLogger({ fn: vi.fn }),
  };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

describe('processNextBackgroundTaskIfAny', () => {
  test('returns wasTaskProcessed: false when no tasks queued', async () => {
    const context = createMockContext();

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: false });
  });

  test('handles task processing errors gracefully', async () => {
    const taskError = new Error('Task failed unexpectedly');
    const context = createMockContext();

    const taskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );

    processBackgroundTaskMock.mockRejectedValue(taskError);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: true });

    const task = await store.getBackgroundTask(taskId);
    expect(task?.startedAt).toBeDefined();
    expect(task?.completedAt).toBeDefined();
    expect(task?.error).toEqual('Task failed unexpectedly');

    consoleSpy.mockRestore();
  });

  test('handles non-Error thrown values gracefully', async () => {
    const context = createMockContext();

    const taskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );

    processBackgroundTaskMock.mockRejectedValue('string error value');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: true });

    const task = await store.getBackgroundTask(taskId);
    expect(task?.completedAt).toBeDefined();
    expect(task?.error).toEqual('string error value');

    consoleSpy.mockRestore();
  });
});

describe('start', () => {
  test('requeues gracefully interrupted tasks on startup', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    // Create a gracefully interrupted task
    const interruptedTaskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );
    await store.startBackgroundTask(interruptedTaskId);
    await store.markTaskAsGracefullyInterrupted(interruptedTaskId);

    processBackgroundTaskMock.mockResolvedValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await start(context, { signal: abortController.signal });
    abortController.abort();

    // Verify the interrupted task was requeued (started_at and interrupted_at cleared)
    const task = await store.getBackgroundTask(interruptedTaskId);
    expect(task?.startedAt).toBeUndefined();
    expect(task?.interruptedAt).toBeUndefined();

    consoleSpy.mockRestore();
  });

  test('logs and reports crashed tasks on startup', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    // Create two crashed tasks (started but not completed, no interrupted_at)
    const crashed1Id = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );
    await store.startBackgroundTask(crashed1Id);

    const crashed2Id = await store.createBackgroundTask(
      'generate_test_decks',
      {}
    );
    await store.startBackgroundTask(crashed2Id);

    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await start(context, { signal: abortController.signal });
    abortController.abort();

    // Should have logged warning about crashed tasks
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('crashed task(s) that will NOT be requeued')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(crashed1Id)
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(crashed2Id)
    );

    // Verify the tasks were marked as failed in the DB
    const task1 = await store.getBackgroundTask(crashed1Id);
    expect(task1?.error).toEqual('Task crashed and was marked as failed');
    expect(task1?.completedAt).toBeDefined();

    const task2 = await store.getBackgroundTask(crashed2Id);
    expect(task2?.error).toEqual('Task crashed and was marked as failed');
    expect(task2?.completedAt).toBeDefined();

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('logs when requeuing gracefully interrupted tasks', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    // Create a gracefully interrupted task
    const gracefulTaskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );
    await store.startBackgroundTask(gracefulTaskId);
    await store.markTaskAsGracefullyInterrupted(gracefulTaskId);

    processBackgroundTaskMock.mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await start(context, { signal: abortController.signal });
    abortController.abort();

    // Should have logged info about requeued tasks
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Requeued 1 gracefully interrupted task(s)')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(gracefulTaskId)
    );

    consoleLogSpy.mockRestore();
  });
});
