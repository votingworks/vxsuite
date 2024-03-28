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
import { createImageData } from '@votingworks/image-utils';
import { Buffer } from 'buffer';
import { SheetOf, mapSheet } from '@votingworks/types';
import makeDebug from 'debug';

const debug = makeDebug('pdi-scanner');

const PDICTL_PATH = path.join(
  assertDefined(__dirname.split('libs')[0]),
  'target/release/pdictl'
);

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
  frontM5SensorCovered: boolean;
  frontRightSensorCovered: boolean;
  scannerReady: boolean;
  xmtAborted: boolean;
  documentJam: boolean;
  scanArrayPixelError: boolean;
  inDiagnosticMode: boolean;
  documentInScanner: boolean;
  calibrationOfUnitNeeded: boolean;
}

/**
 * An event emitted by the scanner client *not* in response to a command. Can be
 * received by adding a listener to the client.
 */
export type ScannerEvent =
  | { type: 'error'; message: string }
  | { type: 'scanStart' }
  | { type: 'scanComplete'; images: SheetOf<ImageData> };

type EjectMotion = 'toRear' | 'toFront' | 'toFrontAndHold';

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

type PdictlResponse =
  | { type: 'ok' }
  | { type: 'error'; message: string }
  | { type: 'scannerStatus'; status: ScannerStatus }
  | { type: 'scanStart' }
  | { type: 'scanComplete'; imageData: [string, string] };

type Listener = (event: ScannerEvent) => void;

type SimpleResult = Result<void, string>;

function loggableResponse(response: PdictlResponse) {
  switch (response.type) {
    case 'scanComplete':
      return {
        ...response,
        imageData: response.imageData.map((imageData) => {
          return `${imageData.length} bytes`;
        }),
      };
    default:
      return response;
  }
}

/**
 * Creates a client for the PDI scanner. Spawns a `pdictl` process and
 * communicates with it over stdin/stdout.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createPdiScannerClient() {
  const pdictl = spawn(PDICTL_PATH, { detached: true });
  let pdictlIsClosed = false;

  let listeners: Listener[] = [];
  function emit(event: ScannerEvent) {
    for (const listener of listeners) {
      listener(event);
    }
  }

  let pendingResponse: Deferred<PdictlResponse> | undefined;
  const rl = createInterface(pdictl.stdout);
  rl.on('line', (line) => {
    const response = JSON.parse(line) as PdictlResponse;
    debug('received:', loggableResponse(response));
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
            return createImageData(Uint8ClampedArray.from(buffer), 1728);
          }),
        });
        break;
      }
      case 'error': {
        if (!pendingResponse) {
          emit(response);
        } else {
          pendingResponse?.resolve(response);
          pendingResponse = undefined;
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
        message: `pdictl process is closed ${command.type}`,
      };
    }
    if (pendingResponse) {
      return { type: 'error', message: `Command in progress ${command.type}` };
    }
    pendingResponse = deferred();
    pdictl.stdin.write(JSON.stringify(command));
    pdictl.stdin.write('\n');
    debug('sent:', command);
    return await pendingResponse?.promise;
  }

  async function sendSimpleCommand(
    command: PdictlCommand
  ): Promise<SimpleResult> {
    const response = await sendCommand(command);
    switch (response.type) {
      case 'ok':
        return ok();
      case 'error':
        return err(response.message);
      default:
        return err(`Unexpected response: ${response.type}`);
    }
  }

  return {
    async connect(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'connect' });
    },

    addListener(listener: Listener): Listener {
      listeners.push(listener);
      return listener;
    },

    removeListener(listener: Listener): void {
      listeners = listeners.filter((l) => l !== listener);
    },

    async getScannerStatus(): Promise<Result<ScannerStatus, string>> {
      const response = await sendCommand({ type: 'getScannerStatus' });
      switch (response.type) {
        case 'scannerStatus':
          return ok(response.status);
        case 'error':
          return err(response.message);
        default:
          return err(`Unexpected response: ${response.type}`);
      }
    },

    async enableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'enableScanning' });
    },

    async disableScanning(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'disableScanning' });
    },

    // Will only work if enableScanning has already been called
    async ejectDocument(ejectMotion: EjectMotion): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'ejectDocument', ejectMotion });
    },

    async disconnect(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'disconnect' });
    },

    async exit(): Promise<SimpleResult> {
      return sendSimpleCommand({ type: 'exit' });
    },
  };
}

/**
 * An interface for issuing commands to a PDI scanner via `pdictl`.
 */
export type ScannerClient = ReturnType<typeof createPdiScannerClient>;
