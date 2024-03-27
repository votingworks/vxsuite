import { z } from 'zod';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';
import { SheetOf } from '@votingworks/types';
import { Deferred, assert, deferred } from '@votingworks/basics';
import {
  createImageData,
  fromGrayScale,
  writeImageData,
} from '@votingworks/image-utils';
import { Buffer } from 'buffer';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Scanner {
  /**
   * Create a new scanner process and connect to the scanner.
   */
  connect(): Promise<void>;

  /**
   * Gracefully shut down the scanner process. Maybe not needed?
   */
  quit(): Promise<void>;

  /**
   * Kill the scanner process. This should be used when the scanner process is
   * unresponsive or we encounter an unexpected error.
   */
  kill(): Promise<void>;

  /**
   * Tell the scanner that it should scan paper it sees or not.
   */
  setScanningEnabled(enabled: boolean): Promise<void>;

  /**
   * Tell the scanner that it should check for multiple sheets.
   *
   * No success message back from this
   */
  setMultiSheetDetectionEnabled(enabled: boolean): Promise<void>;

  /**
   * Kicks off calibration. Response will come back as an event.
   */
  calibrateMultiSheetDetection(
    singleOrDouble: 'single' | 'double'
  ): Promise<void>;

  on(event: Event.BeginScan, listener: () => void): void;
  on(event: Event.EndScan, listener: () => void): void;
  on(event: Event.DocumentJam, listener: () => void): void;
  on(
    event: Event.ScannedImages,
    listener: (images: SheetOf<Uint8Array>) => void
  ): void;
  on(event: Event.MsdCalibrationSucceeded, listener: () => void): void;
  on(event: Event.MsdCalibrationFailed, listener: () => void): void;
}

enum Event {
  /**
   * The scanner has started scanning a document.
   */
  BeginScan = 'beginScan',

  /**
   * The scanner has finished scanning a document. Happens regardless of success.
   */
  EndScan = 'endScan',

  /**
   * Happens when the scanner detects a jam.
   */
  DocumentJam = 'documentJam',

  /**
   * The scanner has generated images. Only happens on successful scan (Rust updates to be made
   * still).
   */
  ScannedImages = 'scannedImages',

  /**
   * The scanner has successfully calibrated multi-sheet detection.
   */
  MsdCalibrationSucceeded = 'msdCalibrationSucceeded',

  /**
   * The scanner has failed to calibrate multi-sheet detection.
   */
  MsdCalibrationFailed = 'msdCalibrationFailed',
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const EventSchema = z.nativeEnum(Event);

const BINARY_PATH = path.join(__dirname, '../../../../target/release/pdictl');

interface ScannerStatus {
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

type EjectMotion = 'toRear' | 'toFront' | 'toFrontAndHold';

type PdictlCommand =
  | { type: 'exit' }
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'get_scanner_status' }
  | { type: 'enable_scanning' }
  | {
      type: 'eject';
      ejectMotion: EjectMotion;
    }
  | { type: 'enable_msd'; enable: boolean }
  | { type: 'calibrate_msd'; calibrationType: 'single' | 'double' }
  | { type: 'get_msd_calibration_config' }
  | { type: 'other' };

type PdictlResponse =
  | { type: 'ok' }
  | { type: 'error'; message: string }
  | { type: 'scanner_status'; status: ScannerStatus }
  | { type: 'scan_complete'; imageData: [string, string] };

class ScannerClient {
  private pdictl?: ChildProcessWithoutNullStreams;
  private pendingRequest?: Deferred<PdictlResponse>;

  private sendCommand(command: PdictlCommand) {
    // eslint-disable-next-line no-console
    console.log('Sent:', command);
    assert(this.pdictl !== undefined);

    this.pendingRequest = deferred();
    this.pdictl.stdin.write(JSON.stringify(command));
    this.pdictl.stdin.write('\n');
  }

  async connect(): Promise<unknown> {
    this.pdictl = spawn(BINARY_PATH);

    const rl = createInterface(this.pdictl.stdout);
    rl.on('line', async (line) => {
      const response = JSON.parse(line) as PdictlResponse;
      // eslint-disable-next-line no-console
      console.log('Received:', response);
      if (response.type === 'scan_complete') {
        const [frontBase64, backBase64] = response.imageData;
        const frontBuffer = Buffer.from(frontBase64, 'base64');
        const backBuffer = Buffer.from(backBase64, 'base64');
        const dateString = new Date().toISOString();

        const grayscaleFrontImageData = createImageData(
          Uint8ClampedArray.from(frontBuffer),
          1728,
          frontBuffer.length / 1728
        );
        const rgbaFrontImageData = fromGrayScale(
          grayscaleFrontImageData.data,
          grayscaleFrontImageData.width,
          grayscaleFrontImageData.height
        );
        await writeImageData(
          path.join(__dirname, 'images', `front-${dateString}.png`),
          rgbaFrontImageData
        );

        const grayscaleBackImageData = createImageData(
          Uint8ClampedArray.from(backBuffer),
          1728,
          backBuffer.length / 1728
        );
        const rgbaBackImageData = fromGrayScale(
          grayscaleBackImageData.data,
          grayscaleBackImageData.width,
          grayscaleBackImageData.height
        );
        await writeImageData(
          path.join(__dirname, 'images', `back-${dateString}.png`),
          rgbaBackImageData
        );

        // await fs.writeFile(
        //   path.join(__dirname, 'images', `front-${dateString}.jpg`),
        //   frontImageData
        // );
        // await fs.writeFile(
        //   path.join(__dirname, 'images', `back-${dateString}.jpg`),
        //   backImageData
        // );
      }
      this.pendingRequest?.resolve(response);
      this.pendingRequest = undefined;
    });

    this.pdictl.stderr.on('data', (data) => {
      // eslint-disable-next-line no-console
      console.error(`stderr: ${data}`);
    });

    this.pdictl.on('close', (code) => {
      // eslint-disable-next-line no-console
      console.log(`child process exited with code ${code}`);
    });

    this.sendCommand({ type: 'connect' });

    const connectResult = await this.pendingRequest?.promise;
    return connectResult;
  }

  async getScannerStatus(): Promise<ScannerStatus> {
    assert(this.pdictl !== undefined);

    this.sendCommand({
      type: 'get_scanner_status',
    });
    const result = await this.pendingRequest?.promise;
    assert(result?.type === 'scanner_status');
    return result.status;
  }

  async enableScanning(): Promise<unknown> {
    assert(this.pdictl !== undefined);

    this.sendCommand({
      type: 'enable_scanning',
    });
    const result = await this.pendingRequest?.promise;
    return result;
  }

  // Will only work if enableScanning has already been called
  async ejectDocument(ejectMotion: EjectMotion): Promise<unknown> {
    assert(this.pdictl !== undefined);

    this.sendCommand({
      type: 'eject',
      ejectMotion,
    });
    const result = await this.pendingRequest?.promise;
    return result;
  }

  async disconnect(): Promise<unknown> {
    assert(this.pdictl !== undefined);

    this.sendCommand({ type: 'disconnect' });
    const result = await this.pendingRequest?.promise;
    return result;
  }
}

// eslint-disable-next-line vx/gts-jsdoc
export async function main(): Promise<void> {
  const scannerClient = new ScannerClient();
  await scannerClient.connect();
  const status = await scannerClient.getScannerStatus();
  await scannerClient.enableScanning();
  if (status.documentInScanner) {
    await scannerClient.ejectDocument('toFront');
  }
  await scannerClient.disconnect();
}
