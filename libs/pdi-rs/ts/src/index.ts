import { z } from 'zod';
import * as path from 'path';
import { spawn } from 'child_process';
import { createInterface } from 'readline';

let addon: any;

export type ScannedDocument = addon.ScannedDocument;

export enum Event {
  BeginScan = 'beginScan',
  EndScan = 'endScan',
  AbortScan = 'abortScan',
  EjectPaused = 'ejectPaused',
  EjectResumed = 'ejectResumed',
  FeederDisabled = 'feederDisabled',
}

export const EventSchema = z.nativeEnum(Event);

export class Scanner {
  private constructor(private internalScanner: addon.Scanner) {}

  /**
   * Connect to the scanner.
   */
  static open(): Scanner {
    return new Scanner(addon.openScanner());
  }

  getStatus(): ScannerStatus {
    return addon.getScannerStatus(this.internalScanner) as ScannerStatus;
  }

  setResolution(resolution: number): void {
    addon.setResolution(this.internalScanner, resolution);
  }

  setColorDepth(colorDepth: ColorDepth): void {
    addon.setColorDepth(this.internalScanner, colorDepth);
  }

  setFeederEnabled(feederEnabled: boolean): void {
    addon.setFeederEnabled(this.internalScanner, feederEnabled);
  }

  getLastScannedDocument(): addon.ScannedDocument | undefined {
    return addon.getLastScannedDocument(this.internalScanner);
  }

  getLastScannerEvent(): Event | undefined {
    const event = addon.getLastScannerEvent(this.internalScanner);
    return event ? EventSchema.parse(event) : undefined;
  }

  acceptDocumentBack(): void {
    addon.acceptDocumentBack(this.internalScanner);
  }

  rejectDocumentFront(): void {
    addon.rejectDocumentFront(this.internalScanner);
  }

  rejectAndHoldDocumentFront(): void {
    addon.rejectAndHoldDocumentFront(this.internalScanner);
  }
}

export enum ColorDepth {
  Bitonal,
  Grayscale4Bit,
  Grayscale8Bit,
  Color8Bit,
  Color24Bit,
  GrayDual8Bit,
  GrayRed8Bit,
  GrayBlue8Bit,
  GrayInfrared8Bit,
  GrayUltraviolet8Bit,
  ColorGray32Bit,
}

export interface ScannerStatus {
  rearLeftSensorCovered: boolean;
  rearRightSensorCovered: boolean;
  branderPositionSensorCovered: boolean;
  highSpeedMode: boolean;
  downloadNeeded: boolean;
  coverOpen: boolean;
  scannerFeederEnabled: boolean;
  frontLeftSensorCovered: boolean;
  frontM1SensorCovered: boolean;
  frontM2SensorCovered: boolean;
  frontM3SensorCovered: boolean;
  frontM4SensorCovered: boolean;
  frontM5SensorCovered: boolean;
  frontRightSensorCovered: boolean;
  scannerReady: boolean;
  xmtAborted: boolean;
  ticketJam: boolean;
  scanArrayPixelError: boolean;
  inDiagnosticMode: boolean;
  documentInScanner: boolean;
  calibrationOfUnitNeeded: boolean;
}

const BINARY_PATH = path.join(__dirname, '../../../../target/release/pdictl');

interface PdictlCommand {
  commandType: 'exit' | 'connect' | 'enable_scanning';
}

interface PdictlOutgoing {
  outgoingType: 'ok' | 'error' | 'scan_complete';
}

export function main() {
  const pdictl = spawn(BINARY_PATH);

  const rl = createInterface(pdictl.stdout);
  rl.on('line', (line) => {
    console.log('Received raw', line);
    const outgoing = JSON.parse(line) as PdictlOutgoing;
    console.log('Received outgoing', outgoing);
  });

  pdictl.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  pdictl.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });

  const command1: PdictlCommand = { commandType: 'connect' };
  console.log('Sending command', command1);
  pdictl.stdin.write(JSON.stringify(command1));
  pdictl.stdin.write('\n');

  const command2: PdictlCommand = { commandType: 'enable_scanning' };
  console.log('Sending command', command2);
  pdictl.stdin.write(JSON.stringify(command2));
  pdictl.stdin.write('\n');
}
