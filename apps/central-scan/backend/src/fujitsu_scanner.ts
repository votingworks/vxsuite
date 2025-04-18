import { assert, deferredQueue } from '@votingworks/basics';
import makeDebug from 'debug';
import { join } from 'node:path';
import { dirSync } from 'tmp';
import {
  BmdBallotPaperSize,
  HmpbBallotPaperSize,
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

export interface ScannedSheetInfo {
  frontPath: string;
  backPath: string;
  ballotAuditId?: string;
}

export interface BatchControl {
  scanSheet(): Promise<ScannedSheetInfo | undefined>;
  endBatch(): Promise<void>;
}

export interface ScanOptions {
  directory?: string;
  pageSize?: HmpbBallotPaperSize;
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

  isImprinterAttached(): Promise<boolean> {
    return new Promise((resolve) => {
      const process = streamExecFile('scanimage', [
        '--device-name',
        'fujitsu',
        '--endorser=yes',
        '--format=jpeg',
        '--dont-scan',
      ]);

      assert(process.stderr);
      let stderr = '';
      process.stderr.on('data', (data: string) => {
        // Collect all stderr output rather than checking each chunk as it comes
        // in because the message we're looking for may be split across multiple
        // chunks.
        stderr += data;
      });

      process.on('close', () => {
        // If there is no imprinter attached a message will be sent to stderr
        // that the endorser parameter is readonly.
        const hasErrorMessage = stderr.includes(
          EXPECTED_IMPRINTER_UNATTACHED_ERROR
        );
        resolve(!hasErrorMessage);
      });
    });
  }

  scanSheets({
    directory = dirSync().name,
    pageSize = HmpbBallotPaperSize.Letter,
    imprintIdPrefix,
  }: ScanOptions = {}): BatchControl {
    const args: string[] = [
      '--device-name',
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
      // If the sheet is smaller than the given size fill in extra image space with black
      `--bgcolor=black`,
    ];

    if (imprintIdPrefix !== undefined) {
      args.push('--endorser=yes');
      // Imprint the prefix followed by a sequential index for each page in the batch
      args.push('--endorser-string', `${imprintIdPrefix}_%04ud`);
    }

    /**
     * We've occasionally seen the Fujitsu return images where HMPB timing marks are ever so
     * slightly clipped, so we add some buffer to the page height to ensure that we capture
     * everything. Scanning extra is safe because the HMPB interpreter trims any extra scan area.
     */
    const HMPB_HEIGHT_BUFFER_INCHES = 0.25;
    const MM_PER_INCH = 25.4;

    function toMillimeters(inches: number): string {
      return String(Math.round(inches * MM_PER_INCH * 1000) / 1000);
    }

    const { width, height: hmpbHeight } = ballotPaperDimensions(pageSize);
    const { height: bmdbHeight } = ballotPaperDimensions(
      BmdBallotPaperSize.Vsap150Thermal
    );
    args.push(
      '--page-width',
      toMillimeters(width),
      '--page-height',
      toMillimeters(
        Math.max(hmpbHeight + HMPB_HEIGHT_BUFFER_INCHES, bmdbHeight)
      )
    );

    if (this.mode) {
      args.push('--mode', this.mode);
    }

    this.logger.log(
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
    const results = deferredQueue<Promise<ScannedSheetInfo | undefined>>();
    let done = false;
    const scanimage = streamExecFile('scanimage', args);

    this.logger.log(
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
      this.logger.log(
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
        results.resolve(
          Promise.resolve({
            frontPath,
            backPath,
            ballotAuditId:
              // Because we pass `${imprintIdPrefix}_%04ud` to --endorser-string the scanner
              // will imprint the prefix followed by a sequential index for each page in the batch,
              // starting with 0000 for the first page, then 0001 and so on.
              imprintIdPrefix !== undefined
                ? `${imprintIdPrefix}_${zeroPad(
                    scannedFiles.length / 2 - 1,
                    4
                  )}`
                : undefined,
          })
        );
      }
    });

    assert(scanimage.stderr);
    new StreamLines(scanimage.stderr).on('line', (line: string) => {
      this.logger.log(
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
        this.logger.log(
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
        this.logger.log(
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
      scanSheet: async (): Promise<ScannedSheetInfo | undefined> => {
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
          this.logger.log(
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
