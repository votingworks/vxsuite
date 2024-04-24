import * as path from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';
import {
  Result,
  assert,
  assertDefined,
  deferredQueue,
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
  | { code: 'disconnected' }
  | { code: 'alreadyConnected' }
  | { code: 'scanInProgress' }
  | { code: 'scanFailed' }
  | { code: 'other'; message: string };

/**
 * An event emitted by the scanner client *not* in response to a command. Can be
 * received by adding a listener to the client.
 */
export type ScannerEvent =
  | ({ event: 'error' } & ScannerError)
  | { event: 'scanStart' }
  | { event: 'scanComplete'; images: SheetOf<ImageData> }
  | { event: 'coverOpen' }
  | { event: 'coverClosed' };

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
  | { command: 'exit' }
  | { command: 'connect' }
  | { command: 'disconnect' }
  | { command: 'getScannerStatus' }
  | { command: 'enableScanning' }
  | { command: 'disableScanning' }
  | {
      command: 'ejectDocument';
      ejectMotion: EjectMotion;
    };

/**
 * Internal type to represent the JSON messages received from `pdictl` in
 * response to commands.
 */
type PdictlResponse =
  | { response: 'ok' }
  | ({ response: 'error' } & ScannerError)
  | { response: 'scannerStatus'; status: ScannerStatus };

/**
 * Internal type to represent the JSON messages received from `pdictl` as
 * unsolicited events (i.e. not in response to a command).
 */
export type PdictlEvent =
  | ({ event: 'error' } & ScannerError)
  | { event: 'scanStart' }
  | { event: 'scanComplete'; imageData: [string, string] }
  | { event: 'coverOpen' }
  | { event: 'coverClosed' };

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

  let listeners: Listener[] = [];
  function emit(event: ScannerEvent) {
    for (const listener of listeners) {
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
      case 'coverClosed': {
        emit(message);
        break;
      }
      /* c8 ignore start */
      default:
        throwIllegalValue(message, 'event');
      /* c8 ignore stop */
    }
  });

  pdictl.stderr.on('data', (data) => {
    /* c8 ignore next */
    debug('pdictl stderr:', data.toString('utf-8'));
  });

  pdictl.on('close', (code) => {
    pdictlIsClosed = true;
    debug(`pdictl child process exited with code ${code}`);
  });

  async function sendCommand(command: PdictlCommand): Promise<PdictlResponse> {
    if (pdictlIsClosed) {
      return {
        response: 'error',
        code: 'disconnected',
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
    async enableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ command: 'enableScanning' });
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
