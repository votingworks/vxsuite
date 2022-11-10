import { assert, deferredQueue, throwIllegalValue } from '@votingworks/utils';
import makeDebug from 'debug';
import { join } from 'path';
import { dirSync } from 'tmp';
import { BallotPaperSize, SheetOf } from '@votingworks/types';
import { LogEventId, Logger } from '@votingworks/logging';
import { streamExecFile } from './exec';
import { StreamLines } from './util/stream_lines';

const debug = makeDebug('scan:scanner');

export interface BatchControl {
  scanSheet(): Promise<SheetOf<string> | undefined>;
  acceptSheet(): Promise<boolean>;
  reviewSheet(): Promise<boolean>;
  rejectSheet(): Promise<boolean>;
  endBatch(): Promise<void>;
}

export interface ScanOptions {
  directory?: string;
  pageSize?: BallotPaperSize;
}

export interface BatchScanner {
  scanSheets(options?: ScanOptions): BatchControl;
}

export enum ScannerImageFormat {
  JPEG = 'jpeg',
  PNG = 'png',
}

export enum ScannerMode {
  Lineart = 'lineart',
  Gray = 'gray',
  Color = 'color',
}

export interface Options {
  format?: ScannerImageFormat;
  mode?: ScannerMode;
  logger: Logger;
}

function zeroPad(number: number, maxLength = 2): string {
  return number.toString().padStart(maxLength, '0');
}

function dateStamp(date: Date = new Date()): string {
  return `${zeroPad(date.getFullYear(), 4)}${zeroPad(
    date.getMonth() + 1
  )}${zeroPad(date.getDay())}_${zeroPad(date.getHours())}${zeroPad(
    date.getMinutes()
  )}${zeroPad(date.getSeconds())}`;
}

/**
 * Scans duplex images in batch mode from a Fujitsu scanner.
 */
export class FujitsuScanner implements BatchScanner {
  private readonly format: ScannerImageFormat;
  private readonly mode?: ScannerMode;
  private readonly logger: Logger;

  constructor({ format = ScannerImageFormat.JPEG, logger, mode }: Options) {
    this.format = format;
    this.mode = mode;
    this.logger = logger;
  }

  scanSheets({
    directory = dirSync().name,
    pageSize = BallotPaperSize.Letter,
  }: ScanOptions = {}): BatchControl {
    const args: string[] = [
      '-d',
      'fujitsu',
      '--resolution',
      '200',
      `--format=${this.format}`,
      '--source=ADF Duplex',
      '--dropoutcolor',
      'Red',
      `--batch=${join(directory, `${dateStamp()}-ballot-%04d.${this.format}`)}`,
      `--batch-print`,
      `--batch-prompt`,
    ];

    if (pageSize === BallotPaperSize.Legal) {
      args.push('--page-width', '215.872', '--page-height', '355.6'); // values in millimeters
    } else if (pageSize === BallotPaperSize.Custom8Point5X17) {
      args.push('--page-width', '215.872', '--page-height', '431.8'); // values in millimeters
    } else if (pageSize === BallotPaperSize.Letter) {
      // this is the default, no changes needed.
    } else {
      throwIllegalValue(pageSize);
    }

    if (this.mode) {
      args.push('--mode', this.mode);
    }

    void this.logger.log(
      LogEventId.FujitsuScanInit,
      'system',
      {
        message: `Calling scanimage to scan into ${directory} in format ${
          this.format
        }; scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`,
      },
      debug
    );

    const scannedFiles: string[] = [];
    const results = deferredQueue<Promise<SheetOf<string> | undefined>>();
    let done = false;
    const scanimage = streamExecFile('scanimage', args);

    void this.logger.log(
      LogEventId.FujitsuScanInit,
      'system',
      {
        message: `'scanimage [pid=${scanimage.pid}] started'`,
      },
      debug
    );

    assert(scanimage.stdout);
    new StreamLines(scanimage.stdout).on('line', (line: string) => {
      const path = line.trim();
      void this.logger.log(
        LogEventId.FujitsuScanImageScanned,
        'system',
        {
          message: `scanimage [pid=${scanimage.pid}] reported a scanned file: ${path}`,
          disposition: 'success',
        },
        debug
      );

      scannedFiles.push(path);
      if (scannedFiles.length % 2 === 0) {
        const [frontPath, backPath] = scannedFiles.slice(-2);
        results.resolve(Promise.resolve([frontPath, backPath]));
      }
    });

    assert(scanimage.stderr);
    new StreamLines(scanimage.stderr).on('line', (line: string) => {
      void this.logger.log(
        LogEventId.FujitsuScanMessage,
        'system',
        {
          message: `scanimage [pid=${scanimage.pid}] msg: ${line.trim()}`,
        },
        debug
      );
    });

    scanimage.once('exit', (code) => {
      done = true;
      if (code !== 0) {
        void this.logger.log(
          LogEventId.FujitsuScanBatchComplete,
          'system',
          {
            message: `scanimage [pid=${scanimage.pid}] exited with code ${code}`,
            disposition: 'failure',
          },
          debug
        );
        results.rejectAll(new Error(`scanimage exited with code=${code}`));
      } else {
        void this.logger.log(
          LogEventId.FujitsuScanBatchComplete,
          'system',
          {
            message: `scanimage [pid=${scanimage.pid}] exited with code 0`,
            disposition: 'success',
          },
          debug
        );
        results.resolveAll(Promise.resolve(undefined));
      }
    });

    return {
      scanSheet: async (): Promise<SheetOf<string> | undefined> => {
        if (results.isEmpty() && !done) {
          debug(
            'scanimage [pid=%d] sending RETURN twice to scan another sheet',
            scanimage.pid
          );
          scanimage.stdin?.write('\n\n');
        }

        return results.get();
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      acceptSheet: async (): Promise<boolean> => {
        return true;
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      reviewSheet: async (): Promise<boolean> => {
        return false;
      },

      // eslint-disable-next-line @typescript-eslint/require-await
      rejectSheet: async (): Promise<boolean> => {
        return false;
      },

      endBatch: async (): Promise<void> => {
        if (!done) {
          done = true;
          void this.logger.log(
            LogEventId.FujitsuScanBatchComplete,
            'system',
            {
              message: `scanimage [pid=${scanimage.pid}] stopping scan by closing stdin`,
              disposition: 'success',
            },
            debug
          );
          await new Promise<void>((resolve) => {
            scanimage.stdin?.end(() => {
              resolve();
            });
          });
        }
      },
    };
  }
}
