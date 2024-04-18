import * as path from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import {
  Deferred,
  Result,
  assertDefined,
  deferred,
  err,
  ok,
  throwIllegalValue,
} from '@votingworks/basics';
import { createImageData, fromGrayScale } from '@votingworks/image-utils';
import { Buffer } from 'buffer';
import { SheetOf, mapSheet } from '@votingworks/types';
import makeDebug from 'debug';

const debug = makeDebug('pdi-scanner');

const PDICTL_PATH = path.join(
  assertDefined(__dirname.split('libs')[0]),
  'target/release/pdictl'
);

const SCAN_IMAGE_WIDTH = 1728;

/**
 * The status of the PDI scanner.
 */
export interface ScannerStatus {
  rearLeftSensorCovered: boolean;
  rearRightSensorCovered: boolean;
  branderPositionSensorCovered: boolean;
  hiSpeedMode: boolean;
  downloadNeeded: boolean;
  scannerEnabled: boolean;
  frontLeftSensorCovered: boolean;
  frontM1SensorCovered: boolean;
  frontM2SensorCovered: boolean;
  frontM3SensorCovered: boolean;
  frontM4SensorCovered: boolean;
  /**
   * @deprecated Not used by PageScan 6, always false.
   */
  frontM5SensorCovered: never;
  /**
   * @deprecated Not used by PageScan 6, always false.
   */
  frontRightSensorCovered: never;
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
  | { code: 'disconnected' }
  | { code: 'alreadyConnected' }
  | { code: 'commandInProgress' }
  | { code: 'scanInProgress' }
  | { code: 'scanFailed' }
  | { code: 'other'; message: string };

/**
 * An event emitted by the scanner client *not* in response to a command. Can be
 * received by adding a listener to the client.
 */
export type ScannerEvent =
  | ({ type: 'error' } & ScannerError)
  | { type: 'scanStart' }
  | { type: 'scanComplete'; images: SheetOf<ImageData> };

/**
 * An event listener for any {@link ScannerEvent} emitted by the scanner.
 */
export type Listener = (event: ScannerEvent) => void;

/**
 * Which direction to eject the document, and whether to hold it there.
 */
export type EjectMotion = 'toRear' | 'toFront' | 'toFrontAndHold';

/**
 * Internal type to represent the JSON commands sent to `pdictl`
 */
type PdictlCommand =
  | { type: 'exit' }
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'getScannerStatus' }
  | { type: 'enableScanning' }
  | { type: 'disableScanning' }
  | {
      type: 'ejectDocument';
      ejectMotion: EjectMotion;
    };

/**
 * Internal type to represent the JSON responses received from `pdictl`. A
 * response can be received in response to a command, or as an unsolicited
 * event.
 */
type PdictlResponse =
  | { type: 'ok' }
  | ({ type: 'error' } & ScannerError)
  | { type: 'scannerStatus'; status: ScannerStatus }
  | { type: 'scanStart' }
  | { type: 'scanComplete'; imageData: [string, string] };

type SimpleResult = Result<void, ScannerError>;

function loggableResponse(response: PdictlResponse) {
  if (response.type === 'scanComplete') {
    return {
      ...response,
      imageData: response.imageData.map(
        (imageData) => `${imageData.length} bytes`
      ),
    };
  }
  return response;
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

  let listeners: Listener[] = [];
  function emit(event: ScannerEvent) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  // pdictl only processes one command at a time, so once we send a command, we
  // can wait on a single response.
  let pendingResponse: Deferred<PdictlResponse> | undefined;

  // Listen for output from pdictl. We may receive either a response to a
  // command or an unsolicited event.
  const rl = createInterface(pdictl.stdout);
  rl.on('line', (line) => {
    const response = JSON.parse(line) as PdictlResponse;
    debug('received: %o', loggableResponse(response));

    switch (response.type) {
      case 'scanStart': {
        emit(response);
        break;
      }
      case 'scanComplete': {
        emit({
          type: 'scanComplete',
          images: mapSheet(response.imageData, (imageData) => {
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
      case 'error': {
        if (pendingResponse) {
          pendingResponse.resolve(response);
          pendingResponse = undefined;
        } else {
          emit(response);
        }
        break;
      }
      case 'ok':
      case 'scannerStatus': {
        pendingResponse?.resolve(response);
        pendingResponse = undefined;
        break;
      }
      default: {
        throwIllegalValue(response, 'type');
      }
    }
  });

  pdictl.stderr.on('data', (data) => {
    debug('pdictl stderr:', data.toString('utf-8'));
  });

  pdictl.on('close', (code) => {
    pdictlIsClosed = true;
    debug(`pdictl child process exited with code ${code}`);
  });

  async function sendCommand(command: PdictlCommand): Promise<PdictlResponse> {
    if (pdictlIsClosed) {
      return {
        type: 'error',
        code: 'disconnected',
      };
    }
    if (pendingResponse) {
      return {
        type: 'error',
        code: 'commandInProgress',
      };
    }
    pendingResponse = deferred();
    pdictl.stdin.write(JSON.stringify(command));
    pdictl.stdin.write('\n');
    debug('sent:', command);
    return pendingResponse.promise;
  }

  async function sendSimpleCommand(
    command: PdictlCommand
  ): Promise<SimpleResult> {
    const response = await sendCommand(command);
    switch (response.type) {
      case 'ok':
        return ok();
      case 'error':
        return err(response);
      default:
        return err({
          code: 'other',
          message: `Unexpected response: ${response.type}`,
        });
    }
  }

  return {
    /**
     * Add a {@link Listener} for any {@link ScannerEvent} emitted by the scanner.
     */
    addListener(listener: Listener): Listener {
      listeners.push(listener);
      return listener;
    },

    /**
     * Remove a previously added {@link Listener}.
     */
    removeListener(listener: Listener): void {
      listeners = listeners.filter((l) => l !== listener);
    },

    /**
     * Connects to the scanner. Must be called before any other commands.
     */
    async connect(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'connect' });
    },

    /**
     * Queries the current {@link ScannerStatus} from the scanner.
     */
    async getScannerStatus(): Promise<Result<ScannerStatus, ScannerError>> {
      const response = await sendCommand({ type: 'getScannerStatus' });
      switch (response.type) {
        case 'scannerStatus':
          return ok(response.status);
        case 'error':
          return err(response);
        default:
          return err({
            code: 'other',
            message: `Unexpected response: ${response.type}`,
          });
      }
    },

    /**
     * Enables the scanner's feeder. Once enabled, the scanner will
     * automatically scan any document inserted into the scanner.
     */
    async enableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'enableScanning' });
    },

    /**
     * Disables the scanner's feeder, preventing it from feeding any documents.
     */
    async disableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'disableScanning' });
    },

    /**
     * Ejects the document from the scanner in the specified direction. Will
     * only work if enableScanning has already been called, otherwise nothing
     * will happen.
     */
    async ejectDocument(ejectMotion: EjectMotion): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'ejectDocument', ejectMotion });
    },

    /**
     * Disconnects pdictl from the scanner, but keeps it running.
     */
    async disconnect(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'disconnect' });
    },

    /**
     * Sends an exit command to the `pdictl` process, which will cause it to
     * disconnect and shutdown.
     */
    async exit(): Promise<SimpleResult> {
      const command: PdictlCommand = { type: 'exit' };
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
