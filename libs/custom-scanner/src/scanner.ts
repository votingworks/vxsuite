import { err, ok, Result, sleep } from '@votingworks/basics';
import { valuesEncodeEquivalently } from '@votingworks/message-coder';
import { Optional, SheetOf } from '@votingworks/types';
import { time } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { findByIds, WebUSBDevice } from 'usb';
import { debug as baseDebug } from './debug';
import { Mutex } from './mutex';
import { convertToInternalScanParameters } from './parameters';
import {
  createJob,
  endJob,
  formMove,
  getImageData,
  getReleaseVersion,
  getStatusInternal,
  resetHardware,
  setScanParameters,
  startScan,
  StatusInternalMessage,
  stopScan,
} from './protocol';
import { convertFromInternalStatus } from './status';
import {
  ErrorCode,
  FormMovement,
  ImageFileFormat,
  ImageFromScanner,
  ReleaseType,
  ScannerStatus,
  ScanParameters,
  ScanSide,
} from './types';
import { UsbDevice } from './usb_device';

const debug = baseDebug.extend('scanner');

const VENDOR_ID = 0x0dd4;
const PRODUCT_ID = 0x4103;
const WATCH_INTERVAL_MS = 250;
const RECREATE_JOB_MAX = 1;
const CREATE_JOB_ERROR_MAX = 4;
const ONLY_VALID_JOB_ID = 0x01; // At the moment, this is the only valid JOB ID!!!

/**
 * Watches the status of the scanner and allows stopping.
 */
export interface StatusWatcher
  extends AsyncIterableIterator<Result<ScannerStatus, ErrorCode>> {
  stop(): void;
}

/**
 * Interface for Custom A4 scanner.
 */
export class Scanner {
  private currentJobId = ONLY_VALID_JOB_ID;
  private readonly communicationMutex = new Mutex();

  constructor(private readonly device: UsbDevice) {}

  /**
   * Finds and connects to the scanner. If the result is `Ok`, the scanner is
   * connected and ready to use. You must call `disconnect` when you're done
   * with it.
   */
  static async open(): Promise<Result<Scanner, ErrorCode>> {
    const legacyDevice = findByIds(VENDOR_ID, PRODUCT_ID);
    if (!legacyDevice) {
      debug('no device found');
      return err(ErrorCode.ScannerOffline);
    }

    try {
      debug('found device: %o', legacyDevice);
      const usbDevice = new UsbDevice(
        await WebUSBDevice.createInstance(legacyDevice)
      );
      const connectResult = await usbDevice.connect();

      if (connectResult.isErr()) {
        debug('connection error: %o', connectResult.err());
        return connectResult;
      }

      debug('connected to device');
      return ok(new Scanner(usbDevice));
    } catch (error) {
      debug('unexpected error: %o', error);
      return err(ErrorCode.OpenDeviceError);
    }
  }

  /**
   * Disconnects from the scanner after waiting for any pending operations to
   * complete.
   */
  async disconnect(): Promise<void> {
    await this.device.disconnect();
  }

  /**
   * Gets the release version of the device for a specific type of release.
   */
  async getReleaseVersion(
    releaseType: ReleaseType
  ): Promise<Result<string, ErrorCode>> {
    return this.device.withLock(() =>
      getReleaseVersion(this.device, releaseType)
    );
  }

  /**
   * Gets low-level information about the scanner's current status.
   */
  private async getStatusInternal(): Promise<
    Result<StatusInternalMessage, ErrorCode>
  > {
    debug('getting status internal');
    return this.device.withLock(() =>
      getStatusInternal(this.device, ONLY_VALID_JOB_ID)
    );
  }

  /**
   * Gets information about the scanner's current status.
   */
  async getStatus(): Promise<Result<ScannerStatus, ErrorCode>> {
    const internalStatusResult = await this.getStatusInternal();

    if (internalStatusResult.isErr()) {
      return internalStatusResult;
    }

    return ok(convertFromInternalStatus(internalStatusResult.ok()).status);
  }

  /**
   * Watches scanner status for changes, yielding promises that resolve with new
   * values whenever the changes occur. The watcher can be stopped by calling
   * `stop` on the returned object.
   *
   * @example
   *
   * ```ts
   * import { createInterface } from 'readline';
   * import { Scanner } from '@votingworks/custom';
   *
   * const scanner = (await Scanner.open()).assertOk('failed to open scanner');
   * const watcher = scanner.watchStatus();
   * const rl = createInterface(process.stdin);
   *
   * rl.on('line', () => {
   *   watcher.stop();
   *   rl.close();
   * });
   *
   * process.stdout.write('Press enter to stop watching status.\n');
   *
   * for await (const statusResult of watcher) {
   *   if (statusResult.isErr()) {
   *     console.error(statusResult.err());
   *   } else {
   *     const status = statusResult.ok();
   *     console.log(status);
   *   }
   * }
   * ```
   */
  watchStatus(): StatusWatcher {
    debug('watching status');
    let stopping = false;
    let lastStatusResponse: Optional<Result<StatusInternalMessage, ErrorCode>>;

    const next = async (): Promise<
      IteratorResult<Result<ScannerStatus, ErrorCode>>
    > => {
      debug('requesting next status');
      if (stopping) {
        debug('watching is stopped, returning done');
        return { done: true, value: undefined };
      }

      debug('watcher getting status internal');
      const getStatusInternalResult = await this.getStatusInternal();

      if (getStatusInternalResult.isErr()) {
        if (
          lastStatusResponse?.isErr() &&
          lastStatusResponse.err() === getStatusInternalResult.err()
        ) {
          debug(
            'watcher status internal error is the same as last time, waiting %dms before trying again',
            WATCH_INTERVAL_MS
          );
          await sleep(WATCH_INTERVAL_MS);
          return next();
        }

        debug('watcher status internal error is different, returning it');
        return { done: false, value: getStatusInternalResult };
      }

      const statusInternal = getStatusInternalResult.ok();

      if (
        lastStatusResponse?.isOk() &&
        valuesEncodeEquivalently(
          StatusInternalMessage,
          lastStatusResponse.ok(),
          statusInternal
        )
      ) {
        debug(
          'watcher status internal is the same as last time, waiting %dms before trying again',
          WATCH_INTERVAL_MS
        );
        await sleep(WATCH_INTERVAL_MS);
        return next();
      }

      const { status } = convertFromInternalStatus(statusInternal);

      lastStatusResponse = getStatusInternalResult;

      debug('watcher status internal is different, returning it: %o', status);
      return {
        done: false,
        value: ok(status),
      };
    };

    return {
      next,

      stop() {
        debug('stopping status watcher');
        stopping = true;
      },

      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  /**
   * Creates a job on the scanner.
   */
  private async createJob(): Promise<Result<number, ErrorCode>> {
    debug('creating job');
    this.currentJobId = ONLY_VALID_JOB_ID;
    let createJobResult!: Result<number, ErrorCode>;

    for (
      let recreateJobCount = 0, errorCount = 0;
      recreateJobCount <= RECREATE_JOB_MAX &&
      errorCount <= CREATE_JOB_ERROR_MAX;

    ) {
      debug('creating job (attempt %d)', recreateJobCount + errorCount + 1);
      createJobResult = await createJob(this.device);

      if (createJobResult.isErr()) {
        const errorCode = createJobResult.err();
        debug('create job error: %o', errorCode);
        if (errorCode === ErrorCode.JobNotValid) {
          void (await endJob(this.device, ONLY_VALID_JOB_ID));
          recreateJobCount += 1;
        } else {
          errorCount += 1;
        }
      } else {
        break;
      }
    }

    debug('create job result: %o', createJobResult);
    if (createJobResult.isOk()) {
      const jobId = createJobResult.ok();
      debug('setting current job id to %d', jobId);
      this.currentJobId = jobId;
    }
    return createJobResult;
  }

  private async withRetries<T>(
    fn: () => Promise<Result<T, ErrorCode>>,
    {
      max = 1,
    }: {
      max?: number;
    } = {}
  ): Promise<Result<T, ErrorCode>> {
    let result!: Result<T, ErrorCode>;

    for (let i = 0; i < max + 1; i += 1) {
      debug('withRetries attempt %d/%d', i + 1, max + 1);

      result = await fn();
      if (result.isOk()) {
        debug('withRetries success on attempt %d/%d', i + 1, max + 1);
        break;
      }

      const error = result.err();
      debug('withRetries error on attempt %d/%d: %o', i + 1, max + 1, error);
      if (error !== ErrorCode.JobNotValid) {
        break;
      }
    }

    return result;
  }

  /**
   * Moves a sheet of paper as directed.
   */
  async move(movement: FormMovement): Promise<Result<void, ErrorCode>> {
    debug('moving %o', movement);
    const result = await this.withRetries(() =>
      formMove(this.device, this.currentJobId, movement)
    );
    debug('move result: %o', result);
    return result;
  }

  async scan(
    scanParameters: ScanParameters
  ): Promise<Result<SheetOf<ImageFromScanner>, ErrorCode>> {
    const timer = time(debug, 'scan');
    debug('scanning');

    const { wantedScanSide: scanSide } = scanParameters;
    const scannerImageA: ImageFromScanner = {
      imageBuffer: Buffer.alloc(0),
      imageWidth: 0,
      imageHeight: 0,
      imageDepth: scanParameters.imageColorDepth,
      imageFormat: ImageFileFormat.Jpeg,
      scanSide: ScanSide.A,
      imageResolution: scanParameters.resolution,
    };
    const scannerImageB: ImageFromScanner = {
      imageBuffer: Buffer.alloc(0),
      imageWidth: 0,
      imageHeight: 0,
      imageDepth: scanParameters.imageColorDepth,
      imageFormat: ImageFileFormat.Jpeg,
      scanSide: ScanSide.B,
      imageResolution: scanParameters.resolution,
    };

    timer.checkpoint('set scan parameters');
    let setScanParametersResult = await this.setScanParameters(scanParameters);

    if (setScanParametersResult.isErr()) {
      if (setScanParametersResult.err() === ErrorCode.JobNotValid) {
        debug('job not valid, recreating job');
        const createJobResult = await this.createJob();

        if (createJobResult.isErr()) {
          return createJobResult;
        }

        setScanParametersResult = await this.setScanParameters(scanParameters);
      }

      if (setScanParametersResult.isErr()) {
        return setScanParametersResult;
      }
    }

    const unlock = this.communicationMutex.lock();

    if (!unlock) {
      return err(ErrorCode.SynchronizationError);
    }

    try {
      timer.checkpoint('start scan');
      const startScanResult = await this.startScan();

      if (startScanResult.isErr()) {
        return startScanResult;
      }

      let errorCount = 0;
      const errorMax = 3;

      let startNoMoveNoScan = 0;
      const maxTimeoutNoMoveNoScan = 5000;

      for (;;) {
        const getStatusInternalResult = await this.getStatusInternal();

        if (getStatusInternalResult.isErr()) {
          if (errorCount < errorMax) {
            errorCount += 1;
            await sleep(1);
            continue;
          }

          return getStatusInternalResult;
        }

        const { status, a4Status } = convertFromInternalStatus(
          getStatusInternalResult.ok()
        );

        if (status.isScanCanceled) {
          debug('scan canceled');
          return err(ErrorCode.NoDocumentToBeScanned);
        }

        if (status.isJamPaperHeldBack) {
          debug('jam paper held back');
          void (await this.stopScan());
          return err(ErrorCode.PaperHeldBack);
        }

        if (status.isPaperJam) {
          debug('paper jam');
          void (await this.stopScan());
          return err(ErrorCode.PaperJam);
        }

        if (!status.isMotorOn && !status.isScanInProgress) {
          // The motor is off and the scan is not in progress, maybe an error?

          if (startNoMoveNoScan === 0) {
            startNoMoveNoScan = Date.now();
          } else if (Date.now() - startNoMoveNoScan > maxTimeoutNoMoveNoScan) {
            debug('waiting for motor on and scan in progress timed out');
            void (await this.stopScan());
            return err(ErrorCode.ScannerError);
          }
        } else {
          startNoMoveNoScan = 0;
        }

        if (
          ((scanSide & ScanSide.A) === 0 || a4Status.endScanSideA) &&
          ((scanSide & ScanSide.B) === 0 || a4Status.endScanSideB)
        ) {
          if (a4Status.imageWidthSideA !== 0) {
            scannerImageA.imageWidth = a4Status.imageWidthSideA;
          }
          if (a4Status.imageWidthSideB !== 0) {
            scannerImageB.imageWidth = a4Status.imageWidthSideB;
          }
          if (a4Status.imageHeightSideA !== 0) {
            scannerImageA.imageHeight = a4Status.imageHeightSideA;
          }
          if (a4Status.imageHeightSideB !== 0) {
            scannerImageB.imageHeight = a4Status.imageHeightSideB;
          }
          break;
        }

        if (
          (scanSide === ScanSide.A || scanSide === ScanSide.A_AND_B) &&
          !a4Status.endScanSideA
        ) {
          errorCount = 0;

          if (a4Status.pageSizeSideA !== 0 && a4Status.imageWidthSideA !== 0) {
            debug(
              'side A has data: pageSize=%d, imageWidth=%d, imageHeight=%d',
              a4Status.pageSizeSideA,
              a4Status.imageWidthSideA,
              a4Status.imageHeightSideA
            );

            for (;;) {
              const getImagePortionBySideResult =
                await this.getImagePortionBySide(
                  ScanSide.A,
                  a4Status.pageSizeSideA,
                  a4Status.imageWidthSideA,
                  a4Status.imageHeightSideA
                );

              if (getImagePortionBySideResult.isErr()) {
                if (errorCount < errorMax) {
                  errorCount += 1;
                  await sleep(10);
                  continue;
                }

                return getImagePortionBySideResult;
              }

              scannerImageA.imageBuffer = Buffer.concat([
                scannerImageA.imageBuffer,
                getImagePortionBySideResult.ok(),
              ]);
              scannerImageA.imageWidth = a4Status.imageWidthSideA;
              scannerImageA.imageHeight = a4Status.imageHeightSideA;

              break;
            }
          } else if (
            a4Status.imageWidthSideA !== 0 &&
            a4Status.imageHeightSideA !== 0 &&
            scannerImageA.imageWidth === 0 &&
            scannerImageA.imageHeight === 0
          ) {
            scannerImageA.imageWidth = a4Status.imageWidthSideA;
            scannerImageA.imageHeight = a4Status.imageHeightSideA;
          }
        }

        if (
          (scanSide === ScanSide.B || scanSide === ScanSide.A_AND_B) &&
          !a4Status.endScanSideB
        ) {
          errorCount = 0;

          if (a4Status.pageSizeSideB !== 0 && a4Status.imageWidthSideB !== 0) {
            debug(
              'side B has data: pageSize=%d, imageWidth=%d, imageHeight=%d',
              a4Status.pageSizeSideB,
              a4Status.imageWidthSideB,
              a4Status.imageHeightSideB
            );

            for (;;) {
              const getImagePortionBySideResult =
                await this.getImagePortionBySide(
                  ScanSide.B,
                  a4Status.pageSizeSideB,
                  a4Status.imageWidthSideB,
                  a4Status.imageHeightSideB
                );

              if (getImagePortionBySideResult.isErr()) {
                if (errorCount < errorMax) {
                  errorCount += 1;
                  await sleep(10);
                  continue;
                }

                return getImagePortionBySideResult;
              }

              scannerImageB.imageBuffer = Buffer.concat([
                scannerImageB.imageBuffer,
                getImagePortionBySideResult.ok(),
              ]);
              scannerImageB.imageWidth = a4Status.imageWidthSideB;
              scannerImageB.imageHeight = a4Status.imageHeightSideB;

              break;
            }
          } else if (
            a4Status.imageWidthSideB !== 0 &&
            a4Status.imageHeightSideB !== 0 &&
            scannerImageB.imageWidth === 0 &&
            scannerImageB.imageHeight === 0
          ) {
            scannerImageB.imageWidth = a4Status.imageWidthSideB;
            scannerImageB.imageHeight = a4Status.imageHeightSideB;
          }
        }

        if (
          status.isScanInProgress &&
          a4Status.pageSizeSideA === 0 &&
          a4Status.pageSizeSideB === 0
        ) {
          debug('scan in progress but no data available');
        }
      }
    } finally {
      unlock();
    }

    timer.checkpoint('stop scan');
    void (await this.stopScan());

    timer.end();
    return ok([scannerImageA, scannerImageB]);
  }

  private async getImagePortionBySide(
    scanSide: ScanSide,
    imagePortionSize: number,
    imageWidth: number,
    imageHeight: number
  ): Promise<Result<Buffer, ErrorCode>> {
    const MAX_IMAGE_PORTION_SIZE = 0xffffff; // Max 3 bytes

    if (imagePortionSize === 0) {
      return ok(Buffer.alloc(0));
    }

    if (imagePortionSize > MAX_IMAGE_PORTION_SIZE) {
      return await this.getImagePortionBySide(
        scanSide,
        MAX_IMAGE_PORTION_SIZE,
        imageWidth,
        imageHeight
      );
    }

    return await getImageData(this.device, imagePortionSize, scanSide);
  }

  /**
   * Sets the scan parameters for the next scan. Does not hold the device lock.
   */
  private async setScanParameters(
    scanParameters: ScanParameters
  ): Promise<Result<void, ErrorCode>> {
    debug('setting scan parameters');
    const scanParametersInternal =
      convertToInternalScanParameters(scanParameters);
    const result = await setScanParameters(
      this.device,
      this.currentJobId,
      scanParametersInternal
    );
    debug('set scan parameters result: %o', result);
    return result;
  }

  /**
   * Scans a sheet of paper.
   */
  private async startScan(): Promise<Result<void, ErrorCode>> {
    debug('starting scan');
    const result = await startScan(this.device, this.currentJobId);
    debug('start scan result: %o', result);
    return result;
  }

  /**
   * Stops a scan in progress.
   */
  async stopScan(): Promise<Result<void, ErrorCode>> {
    debug('stopping scan');
    return this.withLock(() => stopScan(this.device, this.currentJobId));
  }

  async resetHardware(): Promise<Result<void, ErrorCode>> {
    debug('resetting hardware');
    return this.withLock(() =>
      this.withRetries(() => resetHardware(this.device, this.currentJobId))
    );
  }

  /**
   * Runs a function while holding the device lock. If the lock cannot be
   * acquired, returns {@link ErrorCode.SynchronizationError}.
   */
  private async withLock<T>(
    fn: () => Promise<Result<T, ErrorCode>>,
    elseFn: () => Promise<Result<T, ErrorCode>> = () =>
      Promise.resolve(err(ErrorCode.SynchronizationError))
  ): Promise<Result<T, ErrorCode>> {
    const unlock = this.communicationMutex.lock();

    if (!unlock) {
      debug('cannot perform operation, device is locked');
      return elseFn();
    }

    try {
      return await fn();
    } finally {
      unlock();
    }
  }
}
