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

export interface PrecinctScannerCardReportBase {
  readonly tallyMachineType: ReportSourceMachineType.PRECINCT_SCANNER;
  readonly machineId: string;
  readonly isLiveMode: boolean;
  readonly precinctSelection: PrecinctSelection;
  readonly totalBallotsScanned: number;
  readonly timeSaved: number;
  readonly timePollsTransitioned: number;
}

export const PrecinctScannerCardReportBaseSchema = z.object({
  tallyMachineType: z.literal(ReportSourceMachineType.PRECINCT_SCANNER),
  machineId: MachineId,
  isLiveMode: z.boolean(),
  precinctSelection: PrecinctSelectionSchema,
  totalBallotsScanned: z.number(),
  timeSaved: z.number(),
  timePollsTransitioned: z.number(),
});

export interface PrecinctScannerCardTallyReport
  extends PrecinctScannerCardReportBase {
  readonly pollsTransition: StandardPollsTransition;
  readonly ballotCounts: Dictionary<BallotCountDetails>;
  readonly talliesByPrecinct?: Dictionary<CompressedTally>;
  readonly tally: CompressedTally;
}

export const PrecinctScannerCardTallyReportSchema: z.ZodSchema<PrecinctScannerCardTallyReport> =
  PrecinctScannerCardReportBaseSchema.extend({
    pollsTransition: StandardPollsTransitionSchema,
    tally: CompressedTallySchema,
    talliesByPrecinct: z.object({}).catchall(CompressedTallySchema).optional(),
    ballotCounts: z.object({}).catchall(BallotCountDetailsSchema),
  });

export interface PrecinctScannerCardBallotCountReport
  extends PrecinctScannerCardReportBase {
  pollsTransition: PollsSuspensionTransition;
}

export const PrecinctScannerCardBallotCountReportSchema: z.ZodSchema<PrecinctScannerCardBallotCountReport> =
  PrecinctScannerCardReportBaseSchema.extend({
    pollsTransition: PollsSuspensionTransitionSchema,
  });

export type PrecinctScannerCardReport =
  | PrecinctScannerCardBallotCountReport
  | PrecinctScannerCardTallyReport;

export const PrecinctScannerCardReportSchema: z.ZodSchema<PrecinctScannerCardReport> =
  z.union([
    PrecinctScannerCardTallyReportSchema,
    PrecinctScannerCardBallotCountReportSchema,
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
