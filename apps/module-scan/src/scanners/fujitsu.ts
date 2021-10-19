import { strict as assert } from 'assert';
import { ScannerStatus } from '@votingworks/types/api/module-scan';
import { deferredQueue, throwIllegalValue } from '@votingworks/utils';
import makeDebug from 'debug';
import { join } from 'path';
import { dirSync } from 'tmp';
import { BallotPaperSize } from '@votingworks/types';
import {
  BatchControl,
  Scanner,
  ScannerImageFormat,
  ScannerMode,
  ScanOptions,
} from '.';
import { streamExecFile } from '../exec';
import { SheetOf } from '../types';
import StreamLines from '../util/StreamLines';

const debug = makeDebug('module-scan:scanner');

export interface Options {
  format?: ScannerImageFormat;
  mode?: ScannerMode;
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

  constructor({ format = ScannerImageFormat.JPEG, mode }: Options = {}) {
    this.format = format;
    this.mode = mode;
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

    debug(
      'Calling scanimage to scan into %s in format %s; %s',
      directory,
      this.format,
      `scanimage ${args.map((arg) => `'${arg}'`).join(' ')}`
    );

    const scannedFiles: string[] = [];
    const results = deferredQueue<Promise<SheetOf<string> | undefined>>();
    let done = false;
    const scanimage = streamExecFile('scanimage', args);

    debug('scanimage [pid=%d] started', scanimage.pid);

    assert(scanimage.stdout);
    new StreamLines(scanimage.stdout).on('line', (line: string) => {
      const path = line.trim();
      debug(
        'scanimage [pid=%d] reported a scanned file: %s',
        scanimage.pid,
        path
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
      debug('scanimage [pid=%d] stderr: %s', scanimage.pid, line.trim());
    });

    scanimage.once('exit', (code) => {
      debug('scanimage [pid=%d] exited with code %d', scanimage.pid, code);
      done = true;
      if (code !== 0) {
        results.rejectAll(new Error(`scanimage exited with code=${code}`));
      } else {
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
          debug(
            'scanimage [pid=%d] stopping scan by closing stdin',
            scanimage.pid
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
