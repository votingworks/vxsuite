import * as fs from 'node:fs';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner.js';

export interface MockBatchScannerApi {
  addSheets(sheets: readonly ScannedSheetInfo[]): void;
  getStatus(): { sheetCount: number; errorQueued: boolean };
  clearSheets(): void;
  setCopies(copies: number): void;
  setErrorQueued(errorQueued: boolean): void;
  /** Directory for writing temporary ballot images. */
  imageDir: string;
}

/**
 * A mock batch scanner for dev-dock use. PDFs loaded via the dev dock are
 * converted to image pairs and written to {@link imageDir}, then enqueued.
 * When the user clicks to scan a new batch, the scanner state machine calls
 * `scanSheets()`, which returns sheets from the queue. Sheets in the queue are
 * consumed as they are scanned. Use `clearSheets()` to reset and clean up
 * temporary files.
 *
 * `setCopies(n)` scales the stack: each queued sheet is scanned `n` times,
 * simulating a larger stack (and therefore a longer scanning window). It
 * applies to sheets already in the queue and takes effect on the next
 * `scanSheet()` call. `getStatus()` reports the scaled sheet count.
 *
 * `setErrorQueued(true)` queues a one-shot scanner error: the next attempt to
 * scan a sheet fails, whether mid-batch or when opening the next scan session.
 * This exercises the batch error flow; retrying succeeds since the error is
 * consumed. `setErrorQueued(false)` cancels a queued error.
 *
 * Images are stored in the provided directory rather than a random temp
 * directory, so previous runs' files are cleaned up on startup.
 */
export class MockBatchScanner implements BatchScanner, MockBatchScannerApi {
  private queue: ScannedSheetInfo[] = [];
  private copies = 1;
  private copiesScannedOfCurrentSheet = 0;
  private pendingError?: Error;

  constructor(private readonly imageDirPath: string) {
    // Wipe any leftover images from a previous run
    fs.rmSync(this.imageDirPath, { recursive: true, force: true });
    fs.mkdirSync(this.imageDirPath, { recursive: true });
  }

  get imageDir(): string {
    return this.imageDirPath;
  }

  isAttached(): boolean {
    return true;
  }

  isImprinterAttached(): Promise<boolean> {
    return Promise.resolve(false);
  }

  addSheets(sheets: readonly ScannedSheetInfo[]): void {
    this.queue.push(...sheets);
  }

  getStatus(): { sheetCount: number; errorQueued: boolean } {
    return {
      sheetCount:
        this.queue.length * this.copies - this.copiesScannedOfCurrentSheet,
      errorQueued: this.pendingError !== undefined,
    };
  }

  setCopies(copies: number): void {
    this.copies = copies;
    if (this.queue.length > 0 && this.copiesScannedOfCurrentSheet >= copies) {
      this.queue.shift();
      this.copiesScannedOfCurrentSheet = 0;
    }
  }

  clearSheets(): void {
    this.queue = [];
    this.copiesScannedOfCurrentSheet = 0;
    this.pendingError = undefined;
    fs.rmSync(this.imageDirPath, { recursive: true, force: true });
    fs.mkdirSync(this.imageDirPath, { recursive: true });
  }

  setErrorQueued(errorQueued: boolean): void {
    this.pendingError = errorQueued
      ? new Error('simulated scanner error')
      : undefined;
  }

  /* eslint-disable @typescript-eslint/require-await */
  scanSheets(): BatchControl {
    let ended = false;

    return {
      scanSheet: async (): Promise<ScannedSheetInfo | undefined> => {
        if (this.pendingError) {
          const error = this.pendingError;
          this.pendingError = undefined;
          throw error;
        }
        if (ended) {
          return undefined;
        }
        const sheet = this.queue[0];
        if (sheet === undefined) {
          return undefined;
        }
        this.copiesScannedOfCurrentSheet += 1;
        if (this.copiesScannedOfCurrentSheet >= this.copies) {
          this.queue.shift();
          this.copiesScannedOfCurrentSheet = 0;
        }
        return sheet;
      },

      endBatch: async (): Promise<void> => {
        ended = true;
      },
    };
  }
  /* eslint-enable @typescript-eslint/require-await */
}
