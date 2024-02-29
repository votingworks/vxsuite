import { createImageData, writeImageData } from '@votingworks/image-utils';
import {
  FakeReadable,
  fakeReadable,
  FakeWritable,
  fakeWritable,
} from '@votingworks/test-utils';
import { SheetOf } from '@votingworks/types';
import { Optional, throwIllegalValue } from '@votingworks/basics';
import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { fileSync } from 'tmp';
import { BatchControl, BatchScanner } from '../../src/fujitsu_scanner';

export function makeMock<T>(Cls: new (...args: never[]) => T): jest.Mocked<T> {
  if (!jest.isMockFunction(Cls)) {
    throw new Error(
      `${Cls} is not a mock function; are you missing a jest.mock(…) call?`
    );
  }
  return new Cls();
}

type ScanSessionStep =
  | { type: 'sheet'; sheet: SheetOf<string> }
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
        scanSheet: async (): Promise<SheetOf<string> | undefined> => {
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
  stdin: FakeWritable;
  stdout: FakeReadable;
  stderr: FakeReadable;
}

/**
 * Creates a mock child process with mock streams.
 */
export function makeMockChildProcess(): MockChildProcess {
  const result: Partial<ChildProcess> = {
    pid: Math.floor(Math.random() * 10_000),
    stdin: fakeWritable(),
    stdout: fakeReadable(),
    stderr: fakeReadable(),
  };

  return Object.assign(new EventEmitter(), result) as MockChildProcess;
}

export async function makeImageFile(): Promise<string> {
  const imageFile = fileSync({ postfix: '.png' });
  await writeImageData(
    imageFile.name,
    createImageData(Uint8ClampedArray.of(0, 0, 0), 1, 1)
  );
  return imageFile.name;
}
