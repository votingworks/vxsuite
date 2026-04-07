import { Mocked, vi } from 'vitest';
import { createImageData, writeImageData } from '@votingworks/image-utils';
import {
  MockReadable,
  mockReadable,
  MockWritable,
  mockWritable,
} from '@votingworks/test-utils';
import {
  Deferred,
  deferred,
  Optional,
  throwIllegalValue,
} from '@votingworks/basics';
import { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileSync } from 'tmp';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from '../../src/fujitsu_scanner';

export function makeMock<T>(Cls: new (...args: never[]) => T): Mocked<T> {
  if (!vi.isMockFunction(Cls)) {
    throw new Error(
      `${Cls} is not a mock function; are you missing a vi.mock(…) call?`
    );
  }
  return new Cls() as Mocked<T>;
}

type ScanSessionStep =
  | { type: 'sheet'; sheet: ScannedSheetInfo }
  | { type: 'error'; error: Error };

/**
 * Represents a scanner session, but doesn't actually run anything.
 */
class ScannerSessionPlan {
  private readonly steps: ScanSessionStep[] = [];
  private ended = false;

  getStep(index: number): Optional<ScanSessionStep> {
    return this.steps[index];
  }

  /**
   * Adds a scanning step to the session.
   */
  sheet(sheet: ScannedSheetInfo): this {
    if (this.ended) {
      throw new Error('cannot add a sheet scan step to an ended session');
    }
    this.steps.push({ type: 'sheet', sheet });
    return this;
  }

  /**
   * Adds an error step to the session.
   */
  error(error: Error): this {
    if (this.ended) {
      throw new Error('cannot add an error step to an ended session');
    }
    this.steps.push({ type: 'error', error });
    return this;
  }

  end(): void {
    this.ended = true;
  }

  *[Symbol.iterator](): IterableIterator<ScanSessionStep> {
    if (!this.ended) {
      throw new Error(
        'session has not been ended; please call `session.end()` before using it'
      );
    }

    yield* this.steps;
  }
}

export interface MockScanner extends BatchScanner {
  withNextScannerSession(): ScannerSessionPlan;
}

/**
 * Makes a mock scanner where you can define your own sessions.
 *
 * @example
 *
 * const scanner = makeMockScanner()
 * scanner.withNextScannerSession()
 *   .scan('/path/to/image01.png')
 *   .scan('/path/to/image02.png')
 *   .end()
 *
 * // do something to trigger a scan
 */
export function makeMockScanner(): MockScanner {
  let nextScannerSession: ScannerSessionPlan | undefined;

  return {
    isAttached(): boolean {
      return true;
    },

    async isImprinterAttached(): Promise<boolean> {
      return Promise.resolve(false);
    },

    scanSheets(): BatchControl {
      const session = nextScannerSession;
      nextScannerSession = undefined;
      let stepIndex = 0;

      if (!session) {
        throw new Error(
          'no session registered; call scanner.withNextScannerSession() to define the next session'
        );
      }

      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        scanSheet: async (): Promise<ScannedSheetInfo | undefined> => {
          const step = session.getStep(stepIndex);
          stepIndex += 1;

          if (!step) {
            return undefined;
          }

          switch (step.type) {
            case 'sheet':
              return step.sheet;

            case 'error':
              throw step.error;

            default:
              throwIllegalValue(step);
          }
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        endBatch: async (): Promise<void> => {
          stepIndex = Infinity;
        },
      };
    },

    /**
     * Gets the next scanner session to be used when `scanSheets` is called.
     */
    withNextScannerSession(): ScannerSessionPlan {
      if (!nextScannerSession) {
        nextScannerSession = new ScannerSessionPlan();
      }
      return nextScannerSession;
    },
  };
}

export interface MockChildProcess extends ChildProcess {
  stdin: MockWritable;
  stdout: MockReadable;
  stderr: MockReadable;
}

/**
 * Creates a mock child process with mock streams.
 */
export function makeMockChildProcess(): MockChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: mockWritable(),
    stdout: mockReadable(),
    stderr: mockReadable(),
  };

  return Object.assign(new EventEmitter(), result) as MockChildProcess;
}

/**
 * A mock scanner where each `scanSheet()` call blocks until the test resolves
 * a deferred, giving precise control over scan timing.
 */
export interface DeferredMockScanner extends BatchScanner {
  /**
   * Adds a sheet to the scan queue. Returns a deferred whose resolution makes
   * the sheet available to the scan loop.
   */
  addSheet(sheet: ScannedSheetInfo): Deferred<void>;
  /**
   * Signals that no more sheets will be added. The next `scanSheet()` call
   * after all added sheets have been consumed will return `undefined`.
   */
  endSession(): void;
}

export function makeDeferredMockScanner(): DeferredMockScanner {
  interface QueueEntry {
    sheet: ScannedSheetInfo;
    ready: Deferred<void>;
  }

  const queue: QueueEntry[] = [];
  let sessionEnded = false;
  let scanIndex = 0;
  let endBatchCalled = false;
  // Waiters are resolved when a new sheet is added or the session ends,
  // unblocking any scanSheet() call that found an empty queue.
  let queueChangedWaiters: Array<Deferred<void>> = [];

  function notifyQueueChanged(): void {
    const waiters = queueChangedWaiters;
    queueChangedWaiters = [];
    for (const waiter of waiters) {
      waiter.resolve();
    }
  }

  return {
    isAttached(): boolean {
      return true;
    },

    // eslint-disable-next-line @typescript-eslint/require-await
    async isImprinterAttached(): Promise<boolean> {
      return false;
    },

    scanSheets(): BatchControl {
      scanIndex = 0;
      endBatchCalled = false;

      return {
        async scanSheet(): Promise<ScannedSheetInfo | undefined> {
          if (endBatchCalled) return undefined;
          if (!queue[scanIndex]) {
            if (sessionEnded) return undefined;
            // Wait for a sheet to be added or session to end
            const waiter = deferred<void>();
            queueChangedWaiters.push(waiter);
            await waiter.promise;
            if (endBatchCalled || (sessionEnded && !queue[scanIndex])) {
              return undefined;
            }
          }
          const current = queue[scanIndex];
          if (!current) return undefined;
          await current.ready.promise;
          if (endBatchCalled) return undefined;
          scanIndex += 1;
          return current.sheet;
        },

        // eslint-disable-next-line @typescript-eslint/require-await
        async endBatch(): Promise<void> {
          endBatchCalled = true;
          notifyQueueChanged();
        },
      };
    },

    addSheet(sheet: ScannedSheetInfo): Deferred<void> {
      const ready = deferred<void>();
      queue.push({ sheet, ready });
      notifyQueueChanged();
      return ready;
    },

    endSession(): void {
      sessionEnded = true;
      notifyQueueChanged();
    },
  };
}

export async function makeImageFile(): Promise<string> {
  const imageFile = fileSync({ postfix: '.png' });
  await writeImageData(
    imageFile.name,
    createImageData(Uint8ClampedArray.of(0, 0, 0), 1, 1)
  );
  return imageFile.name;
}
