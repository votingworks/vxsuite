import { z } from 'zod';
import * as addon from './rust_addon';

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
