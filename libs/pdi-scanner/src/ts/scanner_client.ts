import * as path from 'node:path';
import { spawn } from 'node:child_process';
import {
  Result,
  assert,
  assertDefined,
  deferredQueue,
  err,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import { ImageData } from '@votingworks/image-utils';
import { Buffer } from 'node:buffer';
import { SheetOf } from '@votingworks/types';
import makeDebug from 'debug';

const debug = makeDebug('pdi-scanner');

const PDICTL_PATH = path.join(
  assertDefined(import.meta.dirname.split('libs')[0]),
  'libs/pdi-scanner/target/release/pdictl'
);

/**
 * The width of the image produced by the scanner.
 */
export const SCAN_IMAGE_WIDTH = 1728;

/**
 * `pdictl` frames its stdout messages as TLV: a 1-byte frame type, a 4-byte
 * little-endian payload length, and the payload. These constants must stay in
 * sync with `main.rs`.
 */
const FRAME_TYPE_LENGTH = 1;

/**
 * Byte length of a little-endian `u32` in the framing layout.
 */
const UINT32_LENGTH = Uint32Array.BYTES_PER_ELEMENT;

const FRAME_HEADER_LENGTH = FRAME_TYPE_LENGTH + UINT32_LENGTH;

/**
 * Byte length of the per-image prefix in a scanComplete payload: a `u32`
 * width followed by a `u32` height.
 */
const IMAGE_DIMENSIONS_LENGTH = 2 * UINT32_LENGTH;

/**
 * TLV frame type for a JSON-encoded response or event (everything except scan
 * results).
 */
const FRAME_TYPE_JSON = 1;

/**
 * TLV frame type for a completed scan. The payload contains, for each side
 * (top then bottom): a 4-byte little-endian width, a 4-byte little-endian
 * height, and `width * height` grayscale pixel bytes. Sending image data as
 * raw bytes rather than JSON avoids base64-encoding multi-megabyte scans and
 * parsing them back out of a giant JSON document.
 */
const FRAME_TYPE_SCAN_COMPLETE = 2;

/**
 * A frame payload larger than this cannot be legitimate (a duplex scan of the
 * longest supported ballot is ~8MB), so it indicates a corrupt or desynced
 * stream. Failing fast beats buffering garbage indefinitely.
 */
const MAX_FRAME_PAYLOAD_LENGTH = 64 * 1024 * 1024;

/**
 * The status of the PDI scanner.
 */
export interface ScannerStatus {
  rearLeftSensorCovered: boolean;
  rearRightSensorCovered: boolean;
  branderPositionSensorCovered: boolean;
  hiSpeedMode: boolean;
  coverOpen: boolean;
  scannerEnabled: boolean;
  frontLeftSensorCovered: boolean;
  frontM1SensorCovered: boolean;
  frontM2SensorCovered: boolean;
  frontM3SensorCovered: boolean;
  frontM4SensorCovered: boolean;
  /**
   * @deprecated Not used by PageScan 6, always false.
   */
  frontM5SensorCovered: false;
  /**
   * @deprecated Not used by PageScan 6, always false.
   */
  frontRightSensorCovered: false;
  scannerReady: boolean;
  xmtAborted: boolean;
  documentJam: boolean;
  scanArrayPixelError: boolean;
  inDiagnosticMode: boolean;
  documentInScanner: boolean;
  calibrationOfUnitNeeded: boolean;
}

/**
 * Coded error responses from the scanner client.
 */
export type ScannerError =
  /** The pdictl process has exited and a new client should be created */
  | { code: 'exited' }
  /** The scanner is disconnected */
  | { code: 'disconnected' }
  /** The scanner is already connected, can't connect again */
  | { code: 'alreadyConnected' }
  /** A scan is in progress and can't be interrupted with other commands */
  | { code: 'scanInProgress' }
  /** Scanning failed */
  | { code: 'scanFailed' }
  /** More than one sheet was detected during scanning. Always followed by a
   * `scanFailed` event.
   */
  | { code: 'doubleFeedDetected' }
  /** Another error occurred. See `message` for details. */
  | { code: 'other'; message: string };

/**
 * An event emitted by the scanner client *not* in response to a command. Can be
 * received by adding a listener to the client.
 */
export type ScannerEvent =
  | ({ event: 'error' } & ScannerError)
  | { event: 'scanStart' }
  | {
      event: 'scanComplete';
      images: SheetOf<ImageData>;
    }
  | { event: 'coverOpen' }
  | { event: 'coverClosed' }
  | { event: 'ejectPaused' }
  | { event: 'ejectResumed' }
  | { event: 'doubleFeedCalibrationComplete' }
  | { event: 'doubleFeedCalibrationTimedOut' }
  | { event: 'imageSensorCalibrationComplete' }
  | {
      event: 'imageSensorCalibrationFailed';
      /**
       * There are a number of possible errors that can occur during image
       * sensor calibration. The only one we explicitly care about handling with
       * a user-facing message is `calibrationTimeoutError` - for the rest we
       * can just show a generic message and log this error code.
       */
      error: 'calibrationTimeoutError' | string;
    };

/**
 * An event listener for any {@link ScannerEvent} emitted by the scanner.
 */
export type Listener = (event: ScannerEvent) => void;

/**
 * Which direction to eject the document, and whether to hold it there.
 */
export type EjectMotion =
  | 'toRear'
  | 'toFront'
  | 'toFrontAndHold'
  | 'toFrontAndRescan';

/**
 * Whether the calibration operation will use a single piece of paper or two pieces of paper.
 */
export type DoubleFeedDetectionCalibrationType = 'single' | 'double';

/**
 * Internal configuration values set by the double feed detection calibration process.
 */
export interface DoubleFeedDetectionCalibrationConfig {
  ledIntensity: number;
  singleSheetCalibrationValue: number;
  doubleSheetCalibrationValue: number;
  thresholdValue: number;
}

/**
 * Internal type to represent the JSON commands sent to `pdictl`
 */
type PdictlCommand =
  | { command: 'exit' }
  | { command: 'connect' }
  | { command: 'disconnect' }
  | { command: 'getScannerStatus' }
  | {
      command: 'enableScanning';
      bitonalThreshold: number;
      doubleFeedDetectionEnabled: boolean;
      paperLengthInches: number;
    }
  | { command: 'disableScanning' }
  | {
      command: 'ejectDocument';
      ejectMotion: EjectMotion;
    }
  | {
      command: 'calibrateDoubleFeedDetection';
      calibrationType: DoubleFeedDetectionCalibrationType;
    }
  | { command: 'getDoubleFeedDetectionCalibrationConfig' }
  | { command: 'calibrateImageSensors' }
  | { command: 'reboot' };

/**
 * Internal type to represent the JSON messages received from `pdictl` in
 * response to commands.
 */
type PdictlResponse =
  | { response: 'ok' }
  | ({ response: 'error' } & ScannerError)
  | { response: 'scannerStatus'; status: ScannerStatus }
  | {
      response: 'doubleFeedDetectionCalibrationConfig';
      config: DoubleFeedDetectionCalibrationConfig;
    };

/**
 * Internal type to represent the JSON messages received from `pdictl` as
 * unsolicited events (i.e. not in response to a command). Completed scans are
 * not JSON messages — they arrive in their own binary frame (see
 * {@link FRAME_TYPE_SCAN_COMPLETE}).
 */
export type PdictlEvent =
  | ({ event: 'error' } & ScannerError)
  | { event: 'scanStart' }
  | { event: 'coverOpen' }
  | { event: 'coverClosed' }
  | { event: 'ejectPaused' }
  | { event: 'ejectResumed' }
  | { event: 'doubleFeedCalibrationComplete' }
  | { event: 'doubleFeedCalibrationTimedOut' }
  | { event: 'imageSensorCalibrationComplete' }
  | { event: 'imageSensorCalibrationFailed'; error: string };

type PdictlMessage = PdictlResponse | PdictlEvent;

type SimpleResult = Result<void, ScannerError>;

function isEvent(message: PdictlMessage): message is PdictlEvent {
  return 'event' in message;
}

function isResponse(message: PdictlMessage): message is PdictlResponse {
  return 'response' in message;
}

/**
 * Parses the payload of a {@link FRAME_TYPE_SCAN_COMPLETE} frame into the two
 * scanned page images. The image data is a zero-copy view over the payload's
 * memory.
 */
function parseScanCompletePayload(payload: Buffer): SheetOf<ImageData> {
  let offset = 0;
  function readImage() {
    const width = payload.readUInt32LE(offset);
    const height = payload.readUInt32LE(offset + UINT32_LENGTH);
    const byteLength = width * height;
    const data = new Uint8ClampedArray(
      payload.buffer,
      payload.byteOffset + offset + IMAGE_DIMENSIONS_LENGTH,
      byteLength
    );
    offset += IMAGE_DIMENSIONS_LENGTH + byteLength;
    return {
      width,
      height,
      data,

      // Define `toJSON` such that `JSON.stringify` does not try to
      // serialize all the bytes in `data` as an array of numbers.
      // eslint-disable-next-line vx/gts-identifiers
      toJSON: () => `[ImageData ${width}x${height}]`,
    };
  }
  const images: SheetOf<ImageData> = [readImage(), readImage()];
  assert(
    offset === payload.length,
    `scanComplete payload length mismatch: expected ${offset}, got ${payload.length}`
  );
  return images;
}

/**
 * Creates a client for the PDI scanner. Spawns a `pdictl` process and
 * communicates with it over stdin/stdout.
 *
 * A client can only be used for one lifetime of the `pdictl` process. Once the
 * process exits and the 'disconnected' error code is returned, the client will
 * no longer be able to send commands and a new client should be created to
 * reconnect to the scanner.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createPdiScannerClient() {
  const pdictl = spawn(PDICTL_PATH, {
    env: { ...process.env, RUST_BACKTRACE: '1' },
  });
  let pdictlIsClosed = false;

  const listeners = new Set<Listener>();
  function emit(event: ScannerEvent) {
    // Snapshot the current set of listeners so that new listeners can be
    // added/removed as a side effect of calling a listener without also
    // receiving this event.
    for (const listener of [...listeners]) {
      listener(event);
    }
  }

  // pdictl queues the commands it receives and only processes one command at a
  // time, so we track the commands we sent in a queue.
  const pendingResponseQueue = deferredQueue<PdictlResponse>();

  function handleJsonMessage(message: PdictlMessage): void {
    debug('received: %o', message);

    if (isResponse(message)) {
      pendingResponseQueue.resolve(message);
      return;
    }

    assert(isEvent(message));
    switch (message.event) {
      case 'scanStart':
      case 'error':
      case 'coverOpen':
      case 'coverClosed':
      case 'ejectPaused':
      case 'ejectResumed':
      case 'doubleFeedCalibrationComplete':
      case 'doubleFeedCalibrationTimedOut':
      case 'imageSensorCalibrationComplete':
      case 'imageSensorCalibrationFailed': {
        emit(message);
        break;
      }
      default: {
        throwIllegalValue(message, 'event');
      }
    }
  }

  function handleFrame(frameType: number, payload: Buffer): void {
    switch (frameType) {
      case FRAME_TYPE_JSON: {
        handleJsonMessage(JSON.parse(payload.toString('utf-8')));
        break;
      }
      case FRAME_TYPE_SCAN_COMPLETE: {
        debug('received: scanComplete (%d payload bytes)', payload.length);
        emit({
          event: 'scanComplete',
          images: parseScanCompletePayload(payload),
        });
        break;
      }
      default: {
        throw new Error(`unknown frame type: ${frameType}`);
      }
    }
  }

  // Listen for output from pdictl, reassembling TLV frames from the stream.
  // We may receive either a response to a command or an unsolicited event.
  const header = Buffer.alloc(FRAME_HEADER_LENGTH);
  let headerFilled = 0;
  let payload: Buffer | undefined;
  let payloadFilled = 0;
  let streamIsCorrupt = false;

  // A malformed frame means we've lost track of where frames begin, so no
  // further output can be trusted. Report the error and ignore the rest of
  // the stream; the consumer is expected to treat this as unrecoverable.
  function handleCorruptStream(error: unknown): void {
    streamIsCorrupt = true;
    debug('corrupt pdictl output stream: %o', error);
    emit({
      event: 'error',
      code: 'other',
      message: `corrupt pdictl output stream: ${error}`,
    });
  }

  pdictl.stdout.on('data', (chunk: Buffer) => {
    if (streamIsCorrupt) return;
    let offset = 0;
    for (;;) {
      if (payload === undefined) {
        const bytesCopied = chunk.copy(
          header,
          headerFilled,
          offset,
          Math.min(chunk.length, offset + (FRAME_HEADER_LENGTH - headerFilled))
        );
        headerFilled += bytesCopied;
        offset += bytesCopied;
        if (headerFilled < FRAME_HEADER_LENGTH) {
          return;
        }
        const payloadLength = header.readUInt32LE(FRAME_TYPE_LENGTH);
        if (payloadLength > MAX_FRAME_PAYLOAD_LENGTH) {
          handleCorruptStream(
            new Error(`frame payload too large: ${payloadLength} bytes`)
          );
          return;
        }
        // Since the payload length is known upfront, each payload byte is
        // copied exactly once from the incoming chunks into its final buffer.
        payload = Buffer.allocUnsafe(payloadLength);
        payloadFilled = 0;
      }
      const bytesCopied = chunk.copy(
        payload,
        payloadFilled,
        offset,
        Math.min(chunk.length, offset + (payload.length - payloadFilled))
      );
      payloadFilled += bytesCopied;
      offset += bytesCopied;
      if (payloadFilled < payload.length) {
        return;
      }
      const framePayload = payload;
      headerFilled = 0;
      payload = undefined;
      try {
        handleFrame(header.readUInt8(0), framePayload);
      } catch (error) {
        handleCorruptStream(error);
        return;
      }
    }
  });

  pdictl.stderr.on(
    'data',
    /* istanbul ignore next */
    (data) => {
      debug('pdictl stderr:', data.toString('utf-8'));
    }
  );

  pdictl.on('close', (code) => {
    pdictlIsClosed = true;
    debug(`pdictl child process exited with code ${code}`);
  });

  async function sendCommand(command: PdictlCommand): Promise<PdictlResponse> {
    if (pdictlIsClosed) {
      return {
        response: 'error',
        code: 'exited',
      };
    }
    const pendingResponse = pendingResponseQueue.get();
    pdictl.stdin.write(JSON.stringify(command));
    pdictl.stdin.write('\n');
    debug('sent:', command);
    return pendingResponse;
  }

  async function sendSimpleCommand(
    command: PdictlCommand
  ): Promise<SimpleResult> {
    const result = await sendCommand(command);
    switch (result.response) {
      case 'ok':
        return ok();
      case 'error':
        return err(result);
      default:
        return err({
          code: 'other',
          message: `Unexpected response: ${result.response}`,
        });
    }
  }

  return {
    /**
     * Add a {@link Listener} for any {@link ScannerEvent} emitted by the scanner.
     */
    addListener(listener: Listener): Listener {
      listeners.add(listener);
      return listener;
    },

    /**
     * Remove a previously added {@link Listener}.
     */
    removeListener(listener: Listener): void {
      listeners.delete(listener);
    },

    /**
     * Connects to the scanner. Must be called before any other commands.
     */
    async connect(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'connect' });
    },

    /**
     * Queries the current {@link ScannerStatus} from the scanner.
     */
    async getScannerStatus(): Promise<Result<ScannerStatus, ScannerError>> {
      const result = await sendCommand({ command: 'getScannerStatus' });
      switch (result.response) {
        case 'scannerStatus':
          return ok(result.status);
        case 'error':
          return err(result);
        default:
          return err({
            code: 'other',
            message: `Unexpected response: ${result.response}`,
          });
      }
    },

    /**
     * Enables the scanner's feeder. Once enabled, the scanner will
     * automatically scan any document inserted into the scanner.
     */
    async enableScanning({
      doubleFeedDetectionEnabled,
      paperLengthInches,
    }: {
      doubleFeedDetectionEnabled: boolean;
      paperLengthInches: number;
    }): Promise<SimpleResult> {
      return sendSimpleCommand({
        command: 'enableScanning',
        bitonalThreshold: 75, // See Section 2.1.43 of the PDI PageScan software specification
        doubleFeedDetectionEnabled,
        paperLengthInches,
      });
    },

    /**
     * Disables the scanner's feeder, preventing it from feeding any documents.
     */
    async disableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'disableScanning' });
    },

    /**
     * Ejects the document from the scanner in the specified direction. Will
     * only work if enableScanning has already been called, otherwise nothing
     * will happen.
     */
    async ejectDocument(ejectMotion: EjectMotion): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'ejectDocument', ejectMotion });
    },

    /**
     * Puts the scanner into double feed detection calibration mode for either a
     * single or double sheet. The scanner will wait for you to insert the
     * sheet(s) to calibrate, but this command returns immediately. To find out
     * when the calibration is complete, listen for the
     * `doubleFeedCalibrationComplete` event (or`doubleFeedCalibrationTimedOut`).
     *
     * Note that you should always perform the double sheet calibration first
     * followed by the single sheet calibration.
     */
    async calibrateDoubleFeedDetection(
      calibrationType: DoubleFeedDetectionCalibrationType
    ): Promise<SimpleResult> {
      return sendSimpleCommand({
        command: 'calibrateDoubleFeedDetection',
        calibrationType,
      });
    },

    /**
     * Retrieves the internal configuration values set by the double feed
     * detection calibration process. They cannot be set directly, but it can be
     * useful for debugging to see the results of the calibration process.
     */
    async getDoubleFeedDetectionCalibrationConfig(): Promise<
      Result<DoubleFeedDetectionCalibrationConfig, ScannerError>
    > {
      const result = await sendCommand({
        command: 'getDoubleFeedDetectionCalibrationConfig',
      });
      switch (result.response) {
        case 'doubleFeedDetectionCalibrationConfig':
          return ok(result.config);
        case 'error':
          return err(result);
        default:
          return err({
            code: 'other',
            message: `Unexpected response: ${result.response}`,
          });
      }
    },

    async calibrateImageSensors(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'calibrateImageSensors' });
    },

    /**
     * Reboots the scanner. The connection will be lost after this command.
     */
    async reboot(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'reboot' });
    },

    /**
     * Disconnects pdictl from the scanner, but keeps it running.
     */
    async disconnect(): Promise<SimpleResult> {
      const result = await sendSimpleCommand({ command: 'disconnect' });

      if (result.err()?.code === 'disconnected') {
        return ok();
      }

      return result;
    },

    /**
     * Sends an exit command to the `pdictl` process, which will cause it to
     * disconnect and shutdown.
     */
    async exit(): Promise<SimpleResult> {
      const command: PdictlCommand = { command: 'exit' };
      pdictl.stdin.write(JSON.stringify(command));
      pdictl.stdin.write('\n');
      debug('sent:', command);
      return Promise.resolve(ok());
    },
  };
}

/**
 * An interface for issuing commands to a PDI scanner via `pdictl`.
 */
export type ScannerClient = ReturnType<typeof createPdiScannerClient>;
