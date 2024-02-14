import { z } from 'zod';
import * as path from 'path';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { createInterface } from 'readline';
import { Deferred, assert, deferred } from '@votingworks/basics';
import {
  createImageData,
  toRgba,
  writeImageData,
} from '@votingworks/image-utils';
import fs from 'fs/promises';
import { SheetOf } from '../../../types/src';

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

export enum Event {
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

export const EventSchema = z.nativeEnum(Event);

const BINARY_PATH = path.join(__dirname, '../../../../target/release/pdictl');

interface EnableMsdCommand {
  commandType: 'enable_msd';
  enable: boolean;
}

interface CalibrateMsdCommand {
  commandType: 'calibrate_msd';
  calibrationType: 'single' | 'double';
}

interface GetMsdCalibrationConfig {
  commandType: 'get_msd_calibration_config';
}

interface GetScannerStatus {
  commandType: 'get_scanner_status';
}

interface OtherCommand {
  commandType: 'exit' | 'connect' | 'enable_scanning';
}

type PdictlCommand =
  | EnableMsdCommand
  | CalibrateMsdCommand
  | GetMsdCalibrationConfig
  | GetScannerStatus
  | OtherCommand;

interface PdictlOutgoingScanComplete {
  outgoingType: 'scan_complete';
  imageData: [string, string];
}

interface PdictlOutgoingError {
  outgoingType: 'error';
  message: string;
}

interface PdictlOutgoingOk {
  outgoingType: 'ok';
}

type PdictlOutgoing =
  | PdictlOutgoingScanComplete
  | PdictlOutgoingError
  | PdictlOutgoingOk;

class ScannerClient {
  pdictl?: ChildProcessWithoutNullStreams;
  pendingRequest?: Deferred<unknown>;

  private sendCommand(command: PdictlCommand) {
    assert(this.pdictl !== undefined);

    this.pendingRequest = deferred();
    this.pdictl.stdin.write(JSON.stringify(command));
    this.pdictl.stdin.write('\n');
  }

  async connect(): Promise<unknown> {
    this.pdictl = spawn(BINARY_PATH);

    const rl = createInterface(this.pdictl.stdout);
    rl.on('line', async (line) => {
      const outgoing = JSON.parse(line) as PdictlOutgoing;
      console.log('Received response from scanner', outgoing);
      if (outgoing.outgoingType === 'scan_complete') {
        const [frontBase64, backBase64] = outgoing.imageData;
        const frontBuffer = Buffer.from(frontBase64, 'base64');
        const backBuffer = Buffer.from(backBase64, 'base64');
        const dateString = new Date().toISOString();

        const grayscaleFrontImageData = createImageData(
          Uint8ClampedArray.from(frontBuffer),
          1728,
          frontBuffer.length / 1728
        );
        const rgbaFrontImageData = toRgba(
          grayscaleFrontImageData
        ).unsafeUnwrap();
        writeImageData(
          path.join(__dirname, 'images', `front-${dateString}.png`),
          rgbaFrontImageData
        );

        const grayscaleBackImageData = createImageData(
          Uint8ClampedArray.from(backBuffer),
          1728,
          backBuffer.length / 1728
        );
        const rgbaBackImageData = toRgba(grayscaleBackImageData).unsafeUnwrap();
        writeImageData(
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
      this.pendingRequest?.resolve(outgoing);
      this.pendingRequest = undefined;
    });

    this.pdictl.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    this.pdictl.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });

    this.sendCommand({ commandType: 'connect' });

    const connectResult = await this.pendingRequest?.promise;
    return connectResult;
  }

  async getScannerStatus(): Promise<unknown> {
    assert(this.pdictl !== undefined);

    this.sendCommand({
      commandType: 'get_scanner_status',
    });
    const result = await this.pendingRequest?.promise;
    return result;
  }

  async enableScanning(): Promise<unknown> {
    assert(this.pdictl !== undefined);

    this.sendCommand({
      commandType: 'enable_scanning',
    });
    const result = await this.pendingRequest?.promise;
    return result;
  }
}

export async function main() {
  const scannerClient = new ScannerClient();
  await scannerClient.connect();
  // await scannerClient.getScannerStatus();
  await scannerClient.enableScanning();
}
