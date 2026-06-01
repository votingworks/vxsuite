import {
  Id,
  EncodedBallotEntry,
  PrinterStatus,
  BallotMode as FullBallotMode,
} from '@votingworks/types';
import { z } from 'zod';
import { BatteryInfo } from '@votingworks/backend';
import { UsbDriveStatus } from '@votingworks/usb-drive';

export interface BarcodeScannerError {
  error: string;
}

export const BarcodeScannerErrorSchema: z.ZodSchema<BarcodeScannerError> =
  z.strictObject({ error: z.string() });

export interface BallotPrintEntry extends EncodedBallotEntry {
  ballotPrintId: Id;
}

/**
 * Environment variables that identify the machine and its software. Set at the
 * machine-level rather than the at the software-level.
 */
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export interface DeviceStatuses {
  printer: PrinterStatus;
  usbDrive: UsbDriveStatus;
  battery?: BatteryInfo;
}

export type BallotMode = Exclude<FullBallotMode, 'sample'>;
