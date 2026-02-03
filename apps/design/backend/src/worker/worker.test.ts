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
        }),
        requeueInterruptedBackgroundTasks: vi.fn().mockResolvedValue(undefined),
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
  test('requeues interrupted tasks and processes tasks in a loop', async () => {
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
      context.workspace.store.requeueInterruptedBackgroundTasks
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
});
