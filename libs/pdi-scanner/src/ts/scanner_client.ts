import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  Result,
  assert,
  assertDefined,
  deferredQueue,
  err,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  ImageData,
  createImageData,
  fromGrayScale,
} from '@votingworks/image-utils';
import { Buffer } from 'node:buffer';
import { SheetOf, mapSheet } from '@votingworks/types';
import makeDebug from 'debug';

const debug = makeDebug('pdi-scanner');

const PDICTL_PATH = path.join(
  assertDefined(__dirname.split('libs')[0]),
  'target/release/pdictl'
);

/**
 * The width of the image produced by the scanner.
 */
export const SCAN_IMAGE_WIDTH = 1728;

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
  | { event: 'doubleFeedCalibrationTimedOut' };

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
  | { command: 'getDoubleFeedDetectionCalibrationConfig' };

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
 * unsolicited events (i.e. not in response to a command).
 */
export type PdictlEvent =
  | ({ event: 'error' } & ScannerError)
  | { event: 'scanStart' }
  | { event: 'scanComplete'; imageData: [string, string] }
  | { event: 'coverOpen' }
  | { event: 'coverClosed' }
  | { event: 'ejectPaused' }
  | { event: 'ejectResumed' }
  | { event: 'doubleFeedCalibrationComplete' }
  | { event: 'doubleFeedCalibrationTimedOut' };

type PdictlMessage = PdictlResponse | PdictlEvent;

type SimpleResult = Result<void, ScannerError>;

function isEvent(message: PdictlMessage): message is PdictlEvent {
  return 'event' in message;
}

function isResponse(message: PdictlMessage): message is PdictlResponse {
  return 'response' in message;
}

function loggableMessage(message: PdictlMessage) {
  if (isEvent(message) && message.event === 'scanComplete') {
    return {
      ...message,
      imageData: message.imageData.map(
        (imageData) => `${imageData.length} bytes`
      ),
    };
  }
  return message;
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
  const pdictl = spawn(PDICTL_PATH);
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

  // Listen for output from pdictl. We may receive either a response to a
  // command or an unsolicited event.
  const rl = createInterface(pdictl.stdout);
  rl.on('line', (line) => {
    const message = JSON.parse(line) as PdictlMessage;
    debug('received: %o', loggableMessage(message));

    if (isResponse(message)) {
      pendingResponseQueue.resolve(message);
      return;
    }

    assert(isEvent(message));
    switch (message.event) {
      case 'scanStart': {
        emit(message);
        break;
      }
      case 'scanComplete': {
        emit({
          event: 'scanComplete',
          images: mapSheet(message.imageData, (imageData) => {
            const buffer = Buffer.from(imageData, 'base64');
            const grayscaleImage = createImageData(
              Uint8ClampedArray.from(buffer),
              SCAN_IMAGE_WIDTH,
              buffer.length / SCAN_IMAGE_WIDTH
            );
            return fromGrayScale(
              grayscaleImage.data,
              grayscaleImage.width,
              grayscaleImage.height
            );
          }),
        });
        break;
      }
      case 'error':
      case 'coverOpen':
      case 'coverClosed':
      case 'ejectPaused':
      case 'ejectResumed':
      case 'doubleFeedCalibrationComplete':
      case 'doubleFeedCalibrationTimedOut': {
        emit(message);
        break;
      }
      /* istanbul ignore next */
      default:
        throwIllegalValue(message, 'event');
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

    /**
     * Disconnects pdictl from the scanner, but keeps it running.
     */
    async disconnect(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'disconnect' });
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
