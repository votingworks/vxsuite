import {
  asyncResultBlock,
  err,
  ok,
  Result,
  sleep,
  throwIllegalValue,
} from '@votingworks/basics';
import { MAX_UINT24 } from '@votingworks/message-coder';
import { SheetOf } from '@votingworks/types';
import { time, Mutex } from '@votingworks/utils';
import { Buffer } from 'node:buffer';
import { debug as baseDebug } from './debug';
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
  DuplexChannel,
  ErrorCode,
  FormMovement,
  ImageFileFormat,
  ImageFromScanner,
  ReleaseType,
  ScannerStatus,
  ScanParameters,
  ScanSide,
} from './types';
import { CustomScanner } from './types/custom_scanner';

const debug = baseDebug.extend('scanner');

const RECREATE_JOB_MAX = 1;
const CREATE_JOB_ERROR_MAX = 4;

/**
 * The only valid job ID. This is a constant because the scanner firmware
 * currently only supports a single job at a time. It's unclear why the concept
 * of a job ID exists at all given this condition, but it does. The firmware
 * will return an error if you try to use any other job ID.
 */
const ONLY_VALID_JOB_ID = 0x01;

/**
 * The maximum number of bytes that can be retrieved in a single call to
 * {@link getImageData}. This is a limitation of the scanner firmware since it
 * uses a 24-bit integer to represent the size of the image portion.
 */
const MAX_IMAGE_PORTION_SIZE = MAX_UINT24;

/**
 * Interface for Custom A4 scanner. The public API methods return `Promise`s
 * that resolve once the operation is complete, and should be "thread-safe".
 * Calling a public API method while another public API method is in progress
 * will cause the second method to wait until the first method is complete.
 */
export class CustomA4Scanner implements CustomScanner {
  /**
   * Lock that must be held by any public API method. Does not provide exclusive
   * access to any shared resource other than the lock state of the mutex
   * itself. This ensures that only one public API method is in progress at a
   * time.
   */
  private readonly publicApiMutex = new Mutex(undefined);

  /**
   * Provides exclusive access to the underlying channel to prevent multiple
   * low-level operations from being in progress at the same time. This mutex
   * may be locked and unlocked multiple times in the course of a single public
   * API call.
   */
  private readonly channelMutex: Mutex<DuplexChannel>;

  constructor(channel: DuplexChannel) {
    this.channelMutex = new Mutex(channel);
  }

  /**
   * Connects to the scanner and prepares to send commands. You must call
   * {@link disconnect} when you are done with the scanner.
   */
  async connect(): Promise<Result<void, ErrorCode>> {
    return await this.publicApiMutex.withLock(() =>
      this.channelMutex.withLock((channel) => channel.connect())
    );
  }

  /**
   * Disconnects from the scanner after waiting for any pending operations to
   * complete.
   */
  async disconnect(): Promise<void> {
    await this.publicApiMutex.withLock(() =>
      this.channelMutex.withLock((channel) => channel.disconnect())
    );
  }

  /**
   * Gets the release version of the channel for a specific type of release.
   */
  async getReleaseVersion(
    releaseType: ReleaseType
  ): Promise<Result<string, ErrorCode>> {
    return await this.publicApiMutex.withLock(() =>
      this.getReleaseVersionInternal(releaseType)
    );
  }

  /**
   * Internal version of {@link getReleaseVersion} that does not hold the public
   * lock.
   */
  private async getReleaseVersionInternal(
    releaseType: ReleaseType
  ): Promise<Result<string, ErrorCode>> {
    return await this.channelMutex.withLock((channel) =>
      getReleaseVersion(channel, releaseType)
    );
  }

  /**
   * Gets information about the scanner's current status.
   */
  getStatus(): Promise<Result<ScannerStatus, ErrorCode>> {
    return asyncResultBlock(
      async (fail) =>
        convertFromInternalStatus((await this.getStatusRaw()).okOrElse(fail))
          .status
    );
  }

  /**
   * Gets the low-level status information from the scanner.
   */
  async getStatusRaw(): Promise<Result<StatusInternalMessage, ErrorCode>> {
    return await this.publicApiMutex.withLock(() => this.getStatusInternal());
  }

  /**
   * Gets low-level information about the scanner's current status. Does not
   * hold the public lock.
   */
  private getStatusInternal(): Promise<
    Result<StatusInternalMessage, ErrorCode>
  > {
    debug('getting status internal');
    return this.channelMutex.withLock((channel) =>
      getStatusInternal(channel, ONLY_VALID_JOB_ID)
    );
  }

  /**
   * Creates a job on the scanner. Does not hold the public lock.
   */
  private async createJobInternal(): Promise<Result<number, ErrorCode>> {
    debug('creating job');
    let createJobResult!: Result<number, ErrorCode>;

    for (
      let recreateJobCount = 0, errorCount = 0;
      recreateJobCount <= RECREATE_JOB_MAX &&
      errorCount <= CREATE_JOB_ERROR_MAX;

    ) {
      debug('creating job (attempt %d)', recreateJobCount + errorCount + 1);
      createJobResult = await this.channelMutex.withLock((channel) =>
        createJob(channel)
      );

      /* istanbul ignore next - @preserve */
      if (createJobResult.isErr()) {
        const errorCode = createJobResult.err();
        debug('create job error: %o', errorCode);
        if (errorCode === ErrorCode.JobNotValid) {
          void (await this.channelMutex.withLock((channel) =>
            endJob(channel, ONLY_VALID_JOB_ID)
          ));
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
      debug('ignoring returned job id: %d', createJobResult.ok());
    }
    return createJobResult;
  }

  /**
   * Retries an attempt to send commands to the scanner up to `max` times.
   * Fails if an error occurs that is not `ErrorCode.JobNotValid`, as this
   * error code indicates that we should try to create a new job.
   */
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
  move(movement: FormMovement): Promise<Result<void, ErrorCode>> {
    return asyncResultBlock(async (fail) => {
      debug('moving %o', movement);
      const result = await this.publicApiMutex.withLock(() =>
        this.withRetries(async () => {
          (await this.createJobInternal()).okOrElse(fail);

          // To stop the motors, the createJobInternal call above is sufficient, as it ends the
          // current job, if any, before creating a new one. This in and of itself stops the
          // motors.
          if (movement === FormMovement.STOP) {
            return ok();
          }

          return await this.channelMutex.withLock((channel) =>
            formMove(channel, ONLY_VALID_JOB_ID, movement)
          );
        })
      );
      debug('move result: %o', result);
      return result;
    });
  }

  /**
   * Scans a sheet of paper and returns the resulting images. Note that this
   * method will always return a pair of `ImageFromScanner` objects, even if the
   * scanner only scanned one side of the paper. The image buffer for the side
   * that was not scanned will be empty.
   */
  scan(
    scanParameters: ScanParameters,
    {
      /* istanbul ignore next - @preserve */
      maxTimeoutNoMoveNoScan = 5_000,
      /* istanbul ignore next - @preserve */
      maxRetries = 3,
    }: { maxTimeoutNoMoveNoScan?: number; maxRetries?: number } = {}
  ): Promise<Result<SheetOf<ImageFromScanner>, ErrorCode>> {
    return asyncResultBlock(async (fail) => {
      const timer = time(debug, 'scan');

      timer.checkpoint('requesting lock');
      const { unlock } = await this.publicApiMutex.asyncLock();
      timer.checkpoint('got lock');

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
      const setScanParametersResult =
        await this.setScanParametersInternal(scanParameters);

      if (setScanParametersResult.isErr()) {
        if (setScanParametersResult.err() === ErrorCode.JobNotValid) {
          debug('job not valid, recreating job');
          (await this.createJobInternal()).okOrElse(fail);
          (await this.setScanParametersInternal(scanParameters)).okOrElse(fail);
        }
      }

      // scan loop state
      let errorCount = 0;
      let startNoMoveNoScan = 0;

      const processImageData = async (
        currentSide: ScanSide,
        {
          pageSize,
          imageWidth,
          imageHeight,
        }: { pageSize: number; imageWidth: number; imageHeight: number }
      ): Promise<Result<void, ErrorCode>> => {
        if (pageSize === 0 || imageWidth === 0) {
          return ok();
        }

        debug(
          'side %s has data: pageSize=%d, imageWidth=%d, imageHeight=%d',
          ScanSide[currentSide],
          pageSize,
          imageWidth,
          imageHeight
        );

        let readImageDataErrorCount = 0;
        const scannerImage =
          currentSide === ScanSide.A ? scannerImageA : scannerImageB;
        for (;;) {
          const getImagePortionBySideResult =
            await this.getImagePortionBySideInternal(currentSide, pageSize);

          /* istanbul ignore next - @preserve */
          if (getImagePortionBySideResult.isErr()) {
            readImageDataErrorCount += 1;
            if (readImageDataErrorCount < maxRetries) {
              await sleep(10);
              continue;
            }

            return getImagePortionBySideResult;
          }

          scannerImage.imageBuffer = Buffer.concat([
            scannerImage.imageBuffer,
            getImagePortionBySideResult.ok(),
          ]);
          scannerImage.imageWidth = imageWidth;
          scannerImage.imageHeight = imageHeight;

          return ok();
        }
      };

      const scanLoopTick = async (): Promise<
        Result<'continue' | 'break', ErrorCode>
      > => {
        debug('scan: getting status');
        const getStatusInternalResult = await this.getStatusInternal();

        if (getStatusInternalResult.isErr()) {
          errorCount += 1;
          if (errorCount < maxRetries) {
            await sleep(1);
            return ok('continue');
          }

          return getStatusInternalResult;
        }

        const { status, a4Status } = convertFromInternalStatus(
          getStatusInternalResult.ok()
        );
        debug('status: %O', status);
        debug('a4Status: %O', a4Status);

        if (status.isScanCanceled) {
          debug('scan canceled');
          return err(ErrorCode.NoDocumentToBeScanned);
        }

        if (status.isJamPaperHeldBack) {
          debug('jam paper held back');
          void (await this.stopScanInternal());
          return err(ErrorCode.PaperHeldBack);
        }

        if (status.isPaperJam) {
          debug('paper jam');
          void (await this.stopScanInternal());
          return err(ErrorCode.PaperJam);
        }

        if (!status.isMotorOn && !status.isScanInProgress) {
          // The motor is off and the scan is not in progress, maybe an error?

          if (startNoMoveNoScan === 0) {
            debug('starting to wait for motor on and scan in progress');
            startNoMoveNoScan = Date.now();
          } else if (Date.now() - startNoMoveNoScan > maxTimeoutNoMoveNoScan) {
            debug('waiting for motor on and scan in progress timed out');
            void (await this.stopScanInternal());
            return err(ErrorCode.ScannerError);
          } /* istanbul ignore else - @preserve */ else {
            /* this branch often does not run during tests in CircleCI */
            debug('still waiting for motor on and scan in progress');
          }
        } else {
          startNoMoveNoScan = 0;
        }

        if (
          ((scanSide & ScanSide.A) !== ScanSide.A || a4Status.endScanSideA) &&
          ((scanSide & ScanSide.B) !== ScanSide.B || a4Status.endScanSideB)
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
          return ok('break');
        }

        if ((scanSide & ScanSide.A) === ScanSide.A && !a4Status.endScanSideA) {
          (
            await processImageData(ScanSide.A, {
              pageSize: a4Status.pageSizeSideA,
              imageWidth: a4Status.imageWidthSideA,
              imageHeight: a4Status.imageHeightSideA,
            })
          ).okOrElse(fail);
        }

        if ((scanSide & ScanSide.B) === ScanSide.B && !a4Status.endScanSideB) {
          (
            await processImageData(ScanSide.B, {
              pageSize: a4Status.pageSizeSideB,
              imageWidth: a4Status.imageWidthSideB,
              imageHeight: a4Status.imageHeightSideB,
            })
          ).okOrElse(fail);
        }

        /* istanbul ignore next - @preserve */
        if (
          status.isScanInProgress &&
          a4Status.pageSizeSideA === 0 &&
          a4Status.pageSizeSideB === 0
        ) {
          debug('scan in progress but no data available');
        }

        return ok('continue');
      };

      try {
        timer.checkpoint('start scan');
        (await this.startScanInternal()).okOrElse(fail);

        for (;;) {
          const action = (await scanLoopTick()).okOrElse(fail);

          /* istanbul ignore next - @preserve */
          if (action === 'continue') {
            continue;
          } else if (action === 'break') {
            break;
          } else {
            throwIllegalValue(action);
          }
        }
      } finally {
        unlock();
      }

      timer.checkpoint('stop scan');
      void (await this.stopScanInternal());

      timer.end();
      return [scannerImageA, scannerImageB];
    });
  }

  /**
   * Gets part of the scanned image from the scanner. Does not hold the public
   * lock.
   */
  private async getImagePortionBySideInternal(
    scanSide: ScanSide,
    imagePortionSize: number
  ): Promise<Result<Buffer, ErrorCode>> {
    /* istanbul ignore next - @preserve */
    if (imagePortionSize === 0) {
      return ok(Buffer.alloc(0));
    }

    return await this.channelMutex.withLock((channel) =>
      getImageData(
        channel,
        Math.min(imagePortionSize, MAX_IMAGE_PORTION_SIZE),
        scanSide
      )
    );
  }

  /**
   * Sets the scan parameters for the next scan. Does not hold the public lock.
   */
  private async setScanParametersInternal(
    scanParameters: ScanParameters
  ): Promise<Result<void, ErrorCode>> {
    debug('setting scan parameters');
    const scanParametersInternal =
      convertToInternalScanParameters(scanParameters);
    const result = await this.channelMutex.withLock((channel) =>
      setScanParameters(channel, ONLY_VALID_JOB_ID, scanParametersInternal)
    );
    debug('set scan parameters result: %o', result);
    return result;
  }

  /**
   * Scans a sheet of paper. Does not hold the public lock.
   */
  private async startScanInternal(): Promise<Result<void, ErrorCode>> {
    debug('starting scan');
    const result = await this.channelMutex.withLock((channel) =>
      startScan(channel, ONLY_VALID_JOB_ID)
    );
    debug('start scan result: %o', result);
    return result;
  }

  /**
   * Stops a scan in progress. Does not hold the public lock.
   */
  private async stopScanInternal(): Promise<Result<void, ErrorCode>> {
    debug('stopping scan');
    return await this.channelMutex.withLock((channel) =>
      stopScan(channel, ONLY_VALID_JOB_ID)
    );
  }

  /**
   * Resets the hardware.
   */
  resetHardware(): Promise<Result<void, ErrorCode>> {
    return this.publicApiMutex.withLock(() =>
      this.withRetries(() => this.resetHardwareInternal())
    );
  }

  /**
   * Resets the hardware. Does not hold the public lock.
   */
  private async resetHardwareInternal(): Promise<Result<void, ErrorCode>> {
    debug('resetting hardware');
    return await this.channelMutex.withLock((channel) =>
      resetHardware(channel, ONLY_VALID_JOB_ID)
    );
  }
}
