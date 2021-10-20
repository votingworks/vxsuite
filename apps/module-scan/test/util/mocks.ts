import { ScannerClient } from '@votingworks/plustek-sdk';
import { ScannerStatus } from '@votingworks/types/api/module-scan';
import { throwIllegalValue } from '@votingworks/utils';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Readable, Writable } from 'stream';
import { fileSync } from 'tmp';
import { MaybeMocked, mocked } from 'ts-jest/dist/utils/testing';
import { BatchControl, Scanner } from '../../src/scanners';
import { SheetOf } from '../../src/types';
import { writeImageData } from '../../src/util/images';
import { inlinePool, WorkerOps, WorkerPool } from '../../src/workers/pool';

export function makeMock<T>(Cls: new (...args: never[]) => T): MaybeMocked<T> {
  if (!jest.isMockFunction(Cls)) {
    throw new Error(
      `${Cls} is not a mock function; are you missing a jest.mock(…) call?`
    );
  }
  return mocked(new Cls());
}

export function mockWorkerPoolProvider<I, O>(
  call: (input: I) => Promise<O>
): () => WorkerPool<I, O> {
  return (): WorkerPool<I, O> => inlinePool(call);
}

export function makeMockWorkerOps<I>(): jest.Mocked<WorkerOps<I>> {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    send: jest.fn(),
    describe: jest.fn(),
  };
}

type ScanSessionStep =
  | { type: 'sheet'; sheet: SheetOf<string> }
  | { type: 'error'; error: Error };

/**
 * Represents a scanner session, but doesn't actually run anything.
 */
class ScannerSessionPlan {
  private steps: ScanSessionStep[] = [];
  private ended = false;

  getStep(index: number): ScanSessionStep {
    return this.steps[index];
  }

  /**
   * Adds a scanning step to the session.
   */
  sheet(sheet: SheetOf<string>): this {
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

export interface MockScanner extends Scanner {
  withNextScannerSession(): ScannerSessionPlan;
  getStatus: jest.MockedFunction<Scanner['getStatus']>;
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
    getStatus: jest.fn().mockResolvedValue(ScannerStatus.Unknown),

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
        acceptSheet: jest.fn(),
        reviewSheet: jest.fn(),
        rejectSheet: jest.fn(),

        scanSheet: async (): Promise<SheetOf<string>> => {
          const step = session.getStep(stepIndex);
          stepIndex += 1;

          switch (step.type) {
            case 'sheet':
              return step.sheet;

            case 'error':
              throw step.error;

            default:
              throwIllegalValue(step);
          }
        },

        endBatch: async (): Promise<void> => {
          stepIndex = Infinity;
        },
      };
    },

    async calibrate(): Promise<boolean> {
      return true;
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

export interface MockReadable extends Readable {
  append(chunk: string): void;
}

export interface MockWritable extends Writable {
  writes: ReadonlyArray<{ chunk: unknown; encoding?: string }>;
}

/**
 * Makes a mock readable stream.
 */
export function makeMockReadable(): MockReadable {
  const readable = new EventEmitter() as MockReadable;
  let buffer: string | undefined;
  readable.append = jest.fn((chunk): void => {
    buffer = (buffer ?? '') + chunk;
    readable.emit('readable');
  });
  readable.read = jest.fn((size): unknown => {
    if (typeof buffer === 'string') {
      const readSize = size ?? buffer.length;
      const result = buffer.slice(0, readSize);
      buffer = buffer.length <= readSize ? undefined : buffer.slice(readSize);
      return result;
    }
    return undefined;
  });
  return readable;
}

/**
 * Makes a mock writable stream.
 */
export function makeMockWritable(): MockWritable {
  const writable = new EventEmitter() as MockWritable;
  const writes: Array<{ chunk: unknown; encoding?: string }> = [];

  writable.writes = writes;
  writable.write = jest.fn((...args: unknown[]): boolean => {
    let chunk: unknown;
    let encoding: unknown;
    let callback: unknown;

    if (args.length === 3) {
      [chunk, encoding, callback] = args;
    } else if (args.length === 2) {
      [chunk, callback] = args;
    } else {
      [callback] = args;
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string');
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding });
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    return true;
  });

  writable.end = jest.fn((...args: unknown[]): void => {
    let chunk: unknown;
    let encoding: unknown;
    let callback: unknown;

    if (args.length === 3) {
      [chunk, encoding, callback] = args;
    } else if (args.length === 2) {
      [chunk, callback] = args;
    } else {
      [callback] = args;
    }

    if (typeof encoding !== 'undefined' && typeof encoding !== 'string') {
      throw new TypeError('encoding expected to be a string');
    }

    if (typeof chunk !== 'undefined') {
      writes.push({ chunk, encoding });
    }

    process.nextTick(() => {
      if (typeof callback === 'function') {
        callback();
      }
    });
  });

  return writable;
}

export interface MockChildProcess extends ChildProcess {
  stdout: MockReadable;
  stderr: MockReadable;
}

/**
 * Creates a mock child process with mock streams.
 */
export function makeMockChildProcess(): MockChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: makeMockWritable(),
    stdout: makeMockReadable(),
    stderr: makeMockReadable(),
  };

  return Object.assign(new EventEmitter(), result) as MockChildProcess;
}

export async function makeImageFile(): Promise<string> {
  const imageFile = fileSync({ postfix: '.png' });
  await writeImageData(imageFile.name, {
    data: Uint8ClampedArray.of(0, 0, 0),
    width: 1,
    height: 1,
  });
  return imageFile.name;
}

export function makeMockPlustekClient(): jest.Mocked<ScannerClient> {
  return {
    accept: jest.fn(),
    close: jest.fn(),
    getPaperStatus: jest.fn(),
    isConnected: jest.fn(),
    reject: jest.fn(),
    scan: jest.fn(),
    waitForStatus: jest.fn(),
    calibrate: jest.fn(),
  };
}
