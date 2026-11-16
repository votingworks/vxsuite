import {
  err,
  ok,
  type Optional,
  type Result,
  throwIllegalValue,
} from '@votingworks/basics';
import type {
  BatchControl,
  BatchScanner,
  BatchScannerError,
  ScannedSheetInfo,
} from '../../src/batch_scanner.js';

type ScanSessionStep =
  | { type: 'sheet'; sheet: ScannedSheetInfo; onScanned: () => void }
  | { type: 'error'; error: BatchScannerError }
  | { type: 'crash'; error: Error }
  | { type: 'wait'; promise: Promise<void>; onWaiting: () => void };

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
  sheet(sheet: ScannedSheetInfo, onScanned: () => void = () => {}): this {
    if (this.ended) {
      throw new Error('cannot add a sheet scan step to an ended session');
    }
    this.steps.push({ type: 'sheet', sheet, onScanned });
    return this;
  }

  /**
   * Adds a step where the scanner reports an error.
   */
  error(error: BatchScannerError): this {
    if (this.ended) {
      throw new Error('cannot add an error step to an ended session');
    }
    this.steps.push({ type: 'error', error });
    return this;
  }

  /**
   * Adds a step where `scanSheet` rejects unexpectedly.
   */
  crash(error: Error): this {
    if (this.ended) {
      throw new Error('cannot add a crash step to an ended session');
    }
    this.steps.push({ type: 'crash', error });
    return this;
  }

  waitFor(promise: Promise<void>, onWaiting: () => void = () => {}): this {
    if (this.ended) {
      throw new Error('cannot add a wait step to an ended session');
    }
    this.steps.push({ type: 'wait', promise, onWaiting });
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

    async isImprinterDetected(): Promise<boolean> {
      return Promise.resolve(false);
    },

    startBatch(): BatchControl {
      const session = nextScannerSession;
      nextScannerSession = undefined;
      let stepIndex = 0;

      if (!session) {
        throw new Error(
          'no session registered; call scanner.withNextScannerSession() to define the next session'
        );
      }

      return {
        scanSheet: async (): Promise<
          Result<ScannedSheetInfo | undefined, BatchScannerError>
        > => {
          let step = session.getStep(stepIndex);
          stepIndex += 1;
          while (step?.type === 'wait') {
            step.onWaiting();
            await step.promise;
            step = session.getStep(stepIndex);
            stepIndex += 1;
          }

          if (!step) {
            return ok(undefined);
          }

          switch (step.type) {
            case 'sheet':
              step.onScanned();
              return ok(step.sheet);

            case 'error':
              return err(step.error);

            case 'crash':
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
     * Gets the next scanner session to be used when `startBatch` is called.
     */
    withNextScannerSession(): ScannerSessionPlan {
      if (!nextScannerSession) {
        nextScannerSession = new ScannerSessionPlan();
      }
      return nextScannerSession;
    },
  };
}
