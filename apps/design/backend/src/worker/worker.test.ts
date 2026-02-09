import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudTranslator,
  makeMockGoogleCloudTextToSpeechClient,
  makeMockGoogleCloudTranslationClient,
} from '@votingworks/backend';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { backendWaitFor, suppressingConsoleOutput } from '@votingworks/test-utils';
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

    const result = await suppressingConsoleOutput(() => processNextBackgroundTaskIfAny(context));

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

    const interruptedTaskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );
    await store.startBackgroundTask(interruptedTaskId);
    await store.markTaskAsGracefullyInterrupted(interruptedTaskId);

    processBackgroundTaskMock.mockResolvedValue(undefined);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const startPromise = start(context, { signal: abortController.signal });
    abortController.abort();
    await startPromise;

    const task = await store.getBackgroundTask(interruptedTaskId);
    expect(task?.startedAt).toBeUndefined();
    expect(task?.interruptedAt).toBeUndefined();

    consoleSpy.mockRestore();
  });

  test('logs and reports crashed tasks on startup', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

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

    const startPromise = start(context, { signal: abortController.signal });
    abortController.abort();
    await startPromise;

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('crashed task(s) that will NOT be requeued')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(crashed1Id)
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(crashed2Id)
    );

    const task1 = await store.getBackgroundTask(crashed1Id);
    expect(task1?.error).toEqual('Task crashed and was marked as failed');
    expect(task1?.completedAt).toBeDefined();

    const task2 = await store.getBackgroundTask(crashed2Id);
    expect(task2?.error).toEqual('Task crashed and was marked as failed');
    expect(task2?.completedAt).toBeDefined();

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('SIGTERM marks the current task as gracefully interrupted', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    const taskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );

    let resolveTask!: () => void;
    const taskPickedUpPromise = new Promise<void>((resolve) => {
      processBackgroundTaskMock.mockImplementation(
        () =>
          new Promise<void>((resolveInner) => {
            resolve();
            resolveTask = resolveInner;
          })
      );
    });

    const exitPromise = new Promise<void>((resolve) => {
      vi.spyOn(process, 'exit').mockImplementation((() => {
        resolve();
      }) as typeof process.exit);
    });

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    const startPromise = start(context, { signal: abortController.signal });

    await taskPickedUpPromise;
    process.emit('SIGTERM');
    await exitPromise;

    const task = await store.getBackgroundTask(taskId);
    expect(task?.interruptedAt).toBeDefined();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Received SIGTERM')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Marked task ${taskId} as gracefully interrupted`)
    );
    expect(process.exit).toHaveBeenCalledWith(0);

    abortController.abort();
    resolveTask();
    consoleSpy.mockRestore()
    await startPromise;
  });

  test('SIGTERM exits gracefully when no task is in progress', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    vi.spyOn(process, 'exit').mockImplementation((() => { }) as typeof process.exit);
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    const startPromise = start(context, { signal: abortController.signal });

    process.emit('SIGTERM');

    await backendWaitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM')
      );
    }, { interval: 10 })
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Graceful shutdown complete')
    );
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Marked task')
    );
    expect(process.exit).toHaveBeenCalledWith(0);

    abortController.abort();
    await startPromise;
    consoleSpy.mockRestore()
  });

  test('logs when requeuing gracefully interrupted tasks', async () => {
    const abortController = new AbortController();
    const context = createMockContext();

    const gracefulTaskId = await store.createBackgroundTask(
      'generate_election_package',
      {}
    );
    await store.startBackgroundTask(gracefulTaskId);
    await store.markTaskAsGracefullyInterrupted(gracefulTaskId);

    processBackgroundTaskMock.mockResolvedValue(undefined);

    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
    const startPromise = start(context, { signal: abortController.signal });
    abortController.abort();
    await startPromise;

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Requeued 1 gracefully interrupted task(s)')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining(gracefulTaskId)
    );

    consoleLogSpy.mockRestore();
  });
});
