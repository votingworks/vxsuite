import {
  CompressedTally,
  CompressedTallySchema,
  Dictionary,
  MachineId,
  PollsSuspensionTransition,
  PollsSuspensionTransitionSchema,
  PrecinctSelection,
  PrecinctSelectionSchema,
  StandardPollsTransition,
  StandardPollsTransitionSchema,
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
 * Data representing a precinct scanner tally report for when polls are opened
 * or closed.
 */
export interface ScannerTallyReportData extends ScannerReportDataBase {
  readonly pollsTransition: StandardPollsTransition;
  readonly ballotCounts: Dictionary<BallotCountDetails>;
  readonly talliesByPrecinct?: Dictionary<CompressedTally>;
  readonly tally: CompressedTally;
}

export const ScannerTallyReportDataSchema: z.ZodSchema<ScannerTallyReportData> =
  ScannerReportDataBaseSchema.extend({
    pollsTransition: StandardPollsTransitionSchema,
    tally: CompressedTallySchema,
    talliesByPrecinct: z.object({}).catchall(CompressedTallySchema).optional(),
    ballotCounts: z.object({}).catchall(BallotCountDetailsSchema),
  });

/**
 * Data representing a precinct scanner ballot count report for when voting is
 * paused or resumed. Unlike the tally reports used for polls opening and
 * closing, ballot count reports omit any tally data in accordance with
 * VVSG 2.0 1.1.9-K which disallows extracting vote tally data while the polls
 * are open.
 */
export interface ScannerBallotCountReportData extends ScannerReportDataBase {
  pollsTransition: PollsSuspensionTransition;
}

export const ScannerBallotCountReportDataSchema: z.ZodSchema<ScannerBallotCountReportData> =
  ScannerReportDataBaseSchema.extend({
    pollsTransition: PollsSuspensionTransitionSchema,
  });

/**
 * Data representing a precinct scanner report for polls opening, polls
 * closing, voting paused, or voting resumed. In order to be allow printing
 * a precinct scanner's report on a ballot-marking device, we export the
 * formatted data onto a smartcard which will then be loaded on the
 * ballot-marking device.
 */
export type ScannerReportData =
  | ScannerBallotCountReportData
  | ScannerTallyReportData;

export const ScannerReportDataSchema: z.ZodSchema<ScannerReportData> = z.union([
  ScannerTallyReportDataSchema,
  ScannerBallotCountReportDataSchema,
]);

/**
 * Identity function useful for asserting the type of the argument/return value.
 * Mainly useful with an object literal argument used in a context where a
 * variable declaration with an explicit type annotation is inelegant, such as
 * when providing a response to `fetch-mock`.
 *
 * @example
 *
 * fetchMock.get('/api', typedAs<MyResponseType>({
 *   status: 'ok',
 *   value: 42,
 * }))
 *
 * @example
 *
 * expect(value).toEqual(typedAs<MyType>({
 *   a: 1,
 *   b: 2,
 * }))
 */
export function typedAs<Type>(value: Type): Type {
  return value;
}

/**
 * Describes the API for application-level persistent storage. Values must be
 * objects that can be persisted via JSON.stringify and JSON.parse.
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
