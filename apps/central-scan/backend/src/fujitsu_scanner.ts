import { assert, deferredQueue } from '@votingworks/basics';
import makeDebug from 'debug';
import { join } from 'path';
import { dirSync } from 'tmp';
import {
  BallotPaperSize,
  SheetOf,
  ballotPaperDimensions,
} from '@votingworks/types';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import { isDeviceAttached } from '@votingworks/backend';
import { streamExecFile } from './exec';
import { StreamLines } from './util/stream_lines';

const debug = makeDebug('scan:scanner');

export const FUJITSU_VENDOR_ID = 0x4c5;
export const FUJITSU_FI_7160_PRODUCT_ID = 0x132e;
export const FUJITSU_FI_8170_PRODUCT_ID = 0x15ff;

export const EXPECTED_IMPRINTER_UNATTACHED_ERROR =
  'attempted to set readonly option endorser';

export interface BatchControl {
  scanSheet(): Promise<SheetOf<string> | undefined>;
  endBatch(): Promise<void>;
}

export interface ScanOptions {
  directory?: string;
  pageSize?: BallotPaperSize;
  imprintIdPrefix?: string; // Prefix for the audit ID to imprint on the ballot, an undefined value means no imprinting
}

export interface BatchScanner {
  isAttached(): boolean;
  isImprinterAttached(): Promise<boolean>;
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
  logger: BaseLogger;
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
  private readonly logger: BaseLogger;

  constructor({ format = ScannerImageFormat.JPEG, logger, mode }: Options) {
    this.format = format;
    this.mode = mode;
    this.logger = logger;
  }

  isAttached(): boolean {
    return isDeviceAttached(
      (device) => device.deviceDescriptor.idVendor === FUJITSU_VENDOR_ID
    );
  }

  async isImprinterAttached(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = streamExecFile('scanimage', [
        '-d',
        'fujitsu',
        '--endorser=yes',
        '--format=jpeg',
        '-n',
      ]);

      assert(process.stderr);
      process.stderr.on('data', (data: string) => {
        // If there is no imprinter attached a message will be sent to stderr
        // that the endorser parameter is readonly.
        if (data.includes(EXPECTED_IMPRINTER_UNATTACHED_ERROR)) {
          resolve(false);
        }
      });

      process.on('close', () => {
        resolve(true);
      });
    });
  }

  scanSheets({
    directory = dirSync().name,
    pageSize = BallotPaperSize.Letter,
    imprintIdPrefix,
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

    if (imprintIdPrefix !== undefined) {
      args.push('--endorser=yes');
      // Imprint the prefix followed by a sequential index for each page in the batch
      args.push('--endorser-string', `${imprintIdPrefix}_%04d`);
    }

    const MM_PER_INCH = 25.3967;
    function toMillimeters(inches: number): string {
      return String(Math.round(inches * MM_PER_INCH * 1000) / 1000);
    }
    const { width, height } = ballotPaperDimensions(pageSize);
    args.push(
      '--page-width',
      toMillimeters(width),
      '--page-height',
      toMillimeters(height)
    );

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
