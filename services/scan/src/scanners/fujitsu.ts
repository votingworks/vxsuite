import { ScannerStatus } from '@votingworks/types/api/services/scan';
import { assert, deferredQueue, throwIllegalValue } from '@votingworks/utils';
import makeDebug from 'debug';
import { join } from 'path';
import { dirSync } from 'tmp';
import { BallotPaperSize } from '@votingworks/types';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BatchControl,
  Scanner,
  ScannerImageFormat,
  ScannerMode,
  ScanOptions,
} from './types';
import { streamExecFile } from '../exec';
import { SheetOf } from '../types';
import { StreamLines } from '../util/stream_lines';

const debug = makeDebug('scan:scanner');

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
export class FujitsuScanner implements Scanner {
  private readonly format: ScannerImageFormat;
  private readonly mode?: ScannerMode;
  private readonly logger: Logger;

  constructor({ format = ScannerImageFormat.JPEG, logger, mode }: Options) {
    this.format = format;
    this.mode = mode;
    this.logger = logger;
  }

  async getStatus(): Promise<ScannerStatus> {
    return ScannerStatus.Unknown;
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
        results.resolve(
          Promise.resolve(scannedFiles.slice(-2) as SheetOf<string>)
        );
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

      acceptSheet: async (): Promise<boolean> => {
        return true;
      },

      reviewSheet: async (): Promise<boolean> => {
        return false;
      },

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

  async calibrate(): Promise<boolean> {
    return false;
  }
}
