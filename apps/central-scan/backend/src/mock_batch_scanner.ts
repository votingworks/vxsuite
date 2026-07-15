import * as fs from 'node:fs';
import { range } from '@votingworks/basics';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner';

export interface MockBatchScannerApi {
  addSheets(
    sheets: ReadonlyArray<{ frontPath: string; backPath: string }>
  ): void;
  getStatus(): { sheetCount: number; errorQueued: boolean };
  clearSheets(): void;
  simulateError(): void;
  /** Directory for writing temporary ballot images. */
  imageDir: string;
}

/**
 * A mock batch scanner for dev-dock use. PDFs loaded via the dev dock are
 * converted to image pairs and written to {@link imageDir}, then enqueued.
 * The queue models the input tray: scanning consumes sheets, and sheets left
 * over when a scan session ends (e.g. the batch is paused) stay in the tray
 * for the next session. Reload the tray via the dev dock to scan the same
 * ballots again. Use `clearSheets()` to reset and clean up temporary files.
 *
 * `sheetCopies` loads each added sheet that many times, simulating a larger
 * stack (and therefore a longer scanning window, e.g. to try the Stop button).
 *
 * `simulateError()` queues a one-shot scanner error: the next attempt to scan
 * a sheet fails, whether mid-batch or when opening the next scan session.
 * This exercises the batch pause-on-error flow; retrying (Continue Scanning)
 * succeeds since the error is consumed.
 *
 * Images are stored in the provided directory rather than a random temp
 * directory, so previous runs' files are cleaned up on startup.
 */
export class MockBatchScanner implements BatchScanner, MockBatchScannerApi {
  private queue: ScannedSheetInfo[] = [];
  private pendingError?: Error;

  constructor(
    private readonly imageDirPath: string,
    private readonly sheetCopies = 1
  ) {
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

  addSheets(
    sheets: ReadonlyArray<{ frontPath: string; backPath: string }>
  ): void {
    this.queue.push(
      ...sheets.flatMap(({ frontPath, backPath }) =>
        range(0, this.sheetCopies).map(() => ({
          front: frontPath,
          back: backPath,
        }))
      )
    );
  }

  getStatus(): { sheetCount: number; errorQueued: boolean } {
    return {
      sheetCount: this.queue.length,
      errorQueued: this.pendingError !== undefined,
    };
  }

  clearSheets(): void {
    this.queue = [];
    this.pendingError = undefined;
    fs.rmSync(this.imageDirPath, { recursive: true, force: true });
    fs.mkdirSync(this.imageDirPath, { recursive: true });
  }

  simulateError(): void {
    this.pendingError = new Error('simulated scanner error');
  }

  /* eslint-disable @typescript-eslint/require-await */
  scanSheets(): BatchControl {
    const { queue } = this;
    let done = false;

    return {
      scanSheet: async (): Promise<ScannedSheetInfo | undefined> => {
        if (this.pendingError) {
          const error = this.pendingError;
          this.pendingError = undefined;
          throw error;
        }
        if (done) {
          return undefined;
        }
        return queue.shift();
      },

      async endBatch(): Promise<void> {
        done = true;
      },
    };
  }
  /* eslint-enable @typescript-eslint/require-await */
}
