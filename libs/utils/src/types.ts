import {
  MachineId,
  PrecinctSelection,
  PrecinctSelectionSchema,
} from '@votingworks/types';
import { z } from 'zod';

// Currently we only support precinct scanner reports but this enum exists for future ability to specify different types
export enum ReportSourceMachineType {
  PRECINCT_SCANNER = 'precinct_scanner',
}
export const ReportSourceMachineTypeSchema = z.nativeEnum(
  ReportSourceMachineType
);

export type BallotCountDetails = [precinct: number, absentee: number];

export const BallotCountDetailsSchema: z.ZodSchema<BallotCountDetails> =
  z.tuple([z.number(), z.number()]);

export interface ScannerReportDataBase {
  readonly tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER;
  readonly machineId: string;
  readonly isLiveMode: boolean;
  readonly precinctSelection: PrecinctSelection;
  readonly totalBallotsScanned: number;
  readonly timeSaved: number;
  readonly timePollsTransitioned: number;
}

export const ScannerReportDataBaseSchema = z.object({
  tallyMachineType: z.literal(ReportSourceMachineType.PRECINCT_SCANNER),
  machineId: MachineId,
  isLiveMode: z.boolean(),
  precinctSelection: PrecinctSelectionSchema,
  totalBallotsScanned: z.number(),
  timeSaved: z.number(),
  timePollsTransitioned: z.number(),
});

/**
 * Describes the API for application-level persistent storage. Values must be
 * objects that can be persisted via JSON.stringify and JSON.parse.
 *
 * @deprecated app backends should manage their own storage.
 */
export interface Storage {
  /**
   * Gets an object from storage by key.
   */
  get(key: string): Promise<unknown>;

  /**
   * Sets an object in storage by key.
   */
  set(key: string, value: unknown): Promise<void>;

  /**
   * Removes an object in storage by key.
   */
  remove(key: unknown): Promise<void>;

  /**
   * Clears all objects out of storage.
   */
  clear(): Promise<void>;
}

/**
 * Defines the API for accessing hardware status.
 */
export interface Hardware {
  /**
   * Reads Battery status
   */
  readBatteryStatus(): Promise<KioskBrowser.BatteryInfo | undefined>;

  /**
   * Reads Printer status
   */
  readPrinterStatus(): Promise<KioskBrowser.PrinterInfo | undefined>;

  /**
   * Subscribe to USB device updates.
   */
  readonly devices: KioskBrowser.Observable<Iterable<KioskBrowser.Device>>;

  /**
   * Subscribe to USB device updates.
   */
  readonly printers: KioskBrowser.Observable<
    Iterable<KioskBrowser.PrinterInfo>
  >;
}
