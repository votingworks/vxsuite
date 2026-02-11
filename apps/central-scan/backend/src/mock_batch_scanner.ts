import * as fs from 'node:fs';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner';

export interface MockBatchScannerApi {
  addSheets(sheets: ScannedSheetInfo[]): void;
  getStatus(): { sheetCount: number };
  clearSheets(): void;
  /** Directory for writing temporary ballot images. */
  imageDir: string;
}

/**
 * A mock batch scanner for dev-dock use. PDFs loaded via the dev dock are
 * converted to image pairs and written to {@link imageDir}, then enqueued.
 * When "Scan New Batch" is clicked, the importer calls `scanSheets()`, which
 * returns sheets from the queue. Sheets remain in the queue across scans so
 * the same ballots can be scanned repeatedly. Use `clearSheets()` to reset
 * and clean up temporary files.
 *
 * Images are stored in the provided directory rather than a random temp
 * directory, so previous runs' files are cleaned up on startup.
 */
export class MockBatchScanner implements BatchScanner, MockBatchScannerApi {
  private queue: ScannedSheetInfo[] = [];

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

  addSheets(sheets: ScannedSheetInfo[]): void {
    this.queue.push(...sheets);
  }

  getStatus(): { sheetCount: number } {
    return { sheetCount: this.queue.length };
  }

  clearSheets(): void {
    this.queue = [];
    fs.rmSync(this.imageDirPath, { recursive: true, force: true });
    fs.mkdirSync(this.imageDirPath, { recursive: true });
  }

  /* eslint-disable @typescript-eslint/require-await */
  scanSheets(): BatchControl {
    const snapshot = [...this.queue];
    let index = 0;

    return {
      async scanSheet(): Promise<ScannedSheetInfo | undefined> {
        if (index >= snapshot.length) {
          return undefined;
        }
        const sheet = snapshot[index];
        index += 1;
        return sheet;
      },

      async endBatch(): Promise<void> {
        index = Infinity;
      },
    };
  }
  /* eslint-enable @typescript-eslint/require-await */
}
