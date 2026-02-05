import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';

import { GoogleCloudSpeechSynthesizer, GoogleCloudTranslator, makeMockGoogleCloudTextToSpeechClient, makeMockGoogleCloudTranslationClient } from '@votingworks/backend';
import * as tasks from './tasks';
import { processNextBackgroundTaskIfAny, start } from './worker';
import { WorkerContext } from './context';

vi.mock('./tasks');

const processBackgroundTaskMock = vi.mocked(tasks.processBackgroundTask);

function createMockContext(overrides?: {
  getOldestQueuedBackgroundTask?: ReturnType<typeof vi.fn>;
  markTaskAsGracefullyInterrupted?: ReturnType<typeof vi.fn>;
  getInterruptedBackgroundTasks?: ReturnType<typeof vi.fn>;
}): WorkerContext {
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
      store: {
        getOldestQueuedBackgroundTask:
          overrides?.getOldestQueuedBackgroundTask ?? vi.fn().mockResolvedValue(undefined),
        startBackgroundTask: vi.fn().mockResolvedValue(undefined),
        completeBackgroundTask: vi.fn().mockResolvedValue(undefined),
        getBackgroundTask: vi.fn().mockResolvedValue({
          id: 'task-1',
          taskName: 'test_task',
          payload: '{}',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          startedAt: new Date('2024-01-01T00:00:01Z'),
          completedAt: new Date('2024-01-01T00:00:02Z'),
          gracefulInterruption: false,
        }),
        requeueInterruptedBackgroundTasks: vi.fn().mockResolvedValue(undefined),
        requeueGracefullyInterruptedBackgroundTasks: vi.fn().mockResolvedValue([]),
        getInterruptedBackgroundTasks:
          overrides?.getInterruptedBackgroundTasks ??
          vi.fn().mockResolvedValue({ graceful: [], nonGraceful: [] }),
        markTaskAsGracefullyInterrupted:
          overrides?.markTaskAsGracefullyInterrupted ?? vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as WorkerContext['workspace'],
    fileStorageClient: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
    speechSynthesizer: mockSynthesizer,
    translator: mockTranslator,
    logger: mockBaseLogger({ fn: vi.fn }),
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('processNextBackgroundTaskIfAny', () => {
  test('returns wasTaskProcessed: false when no tasks queued', async () => {
    const context = createMockContext();

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: false });
    expect(
      context.workspace.store.startBackgroundTask
    ).not.toHaveBeenCalled();
  });

  test('handles task processing errors gracefully', async () => {
    const taskError = new Error('Task failed unexpectedly');
    const context = createMockContext({
      getOldestQueuedBackgroundTask: vi.fn().mockResolvedValue({
        id: 'error-task',
        taskName: 'failing_task',
        payload: '{}',
        createdAt: new Date(),
      }),
    });

    processBackgroundTaskMock.mockRejectedValue(taskError);

    // Suppress console output during error test
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: true });
    expect(context.workspace.store.startBackgroundTask).toHaveBeenCalledWith(
      'error-task'
    );
    expect(
      context.workspace.store.completeBackgroundTask
    ).toHaveBeenCalledWith('error-task', 'Task failed unexpectedly');

    consoleSpy.mockRestore();
  });

  test('handles non-Error thrown values gracefully', async () => {
    const context = createMockContext({
      getOldestQueuedBackgroundTask: vi.fn().mockResolvedValue({
        id: 'string-error-task',
        taskName: 'failing_task',
        payload: '{}',
        createdAt: new Date(),
      }),
    });

    processBackgroundTaskMock.mockRejectedValue('string error value');

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    const result = await processNextBackgroundTaskIfAny(context);

    expect(result).toEqual({ wasTaskProcessed: true });
    expect(
      context.workspace.store.completeBackgroundTask
    ).toHaveBeenCalledWith('string-error-task', 'string error value');

    consoleSpy.mockRestore();
  });
});

describe('start', () => {
  test('requeues gracefully interrupted tasks on startup', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    const context = createMockContext({
      getOldestQueuedBackgroundTask: vi.fn().mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({
            id: 'task-loop',
            taskName: 'loop_task',
            payload: '{}',
            createdAt: new Date(),
            gracefulInterruption: false,
          });
        }
        return Promise.resolve(undefined);
      }),
    });

    processBackgroundTaskMock.mockResolvedValue(undefined);

    // Suppress console output
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await start(context);

    expect(
      context.workspace.store.requeueGracefullyInterruptedBackgroundTasks
    ).toHaveBeenCalledTimes(1);

    // Process the first tick - should process the first task
    await vi.advanceTimersToNextTimerAsync();

    expect(
      context.workspace.store.startBackgroundTask
    ).toHaveBeenCalledWith('task-loop');

    // Next iteration: no task queued, should sleep
    await vi.advanceTimersByTimeAsync(1000);

    // The getOldestQueuedBackgroundTask should have been called at least twice
    // (once with a task, once without)
    expect(
      (context.workspace.store.getOldestQueuedBackgroundTask as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThanOrEqual(2);

    consoleSpy.mockRestore();
  });

  test('logs and reports crashed tasks on startup', async () => {
    vi.useFakeTimers();

    const crashedTasks = [
      {
        id: 'crashed-task-1',
        taskName: 'generate_election_package' as const,
        payload: '{}',
        createdAt: new Date(),
        startedAt: new Date(),
        gracefulInterruption: false,
      },
      {
        id: 'crashed-task-2',
        taskName: 'generate_test_decks' as const,
        payload: '{}',
        createdAt: new Date(),
        startedAt: new Date(),
        gracefulInterruption: false,
      },
    ];

    const context = createMockContext({
      getOldestQueuedBackgroundTask: vi.fn().mockResolvedValue(undefined),
      getInterruptedBackgroundTasks: vi.fn().mockResolvedValue({
        graceful: [],
        nonGraceful: crashedTasks,
      }),
    });

    // Suppress console output
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await start(context);

    // Should have logged warning about crashed tasks
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('crashed task(s) that will NOT be requeued')
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('crashed-task-1, crashed-task-2')
    );

    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  test('logs when requeuing gracefully interrupted tasks', async () => {
    vi.useFakeTimers();

    const gracefulTasks = [
      {
        id: 'graceful-task-1',
        taskName: 'generate_election_package' as const,
        payload: '{}',
        createdAt: new Date(),
        startedAt: new Date(),
        gracefulInterruption: true,
      },
    ];

    const context = createMockContext({
      getOldestQueuedBackgroundTask: vi.fn().mockResolvedValue(undefined),
      getInterruptedBackgroundTasks: vi.fn().mockResolvedValue({
        graceful: gracefulTasks,
        nonGraceful: [],
      }),
    });

    // Mock the requeue to return the tasks
    (context.workspace.store.requeueGracefullyInterruptedBackgroundTasks as ReturnType<typeof vi.fn>)
      .mockResolvedValue(gracefulTasks);

    // Suppress console output
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => { });

    await start(context);

    // Should have logged info about requeued tasks
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Requeued 1 gracefully interrupted task(s)')
    );
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('graceful-task-1')
    );

    consoleLogSpy.mockRestore();
  });
});
