import {
  BallotId,
  BallotLocale,
  BallotStyle,
  BallotStyleId,
  ContestTallyMeta,
  Dictionary,
  MachineId,
  Optional,
  Precinct,
  PrecinctId,
  PromiseOr,
  VotingMethod,
} from '@votingworks/types';
import { z } from 'zod';

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => PromiseOr<void>;
export type TextareaEventFunction = (
  event: React.FormEvent<HTMLTextAreaElement>
) => PromiseOr<void>;
export type ButtonEventFunction = (
  event: React.MouseEvent<HTMLButtonElement>
) => PromiseOr<void>;

// Election
export type SaveElection = (electionJson?: string) => Promise<void>;

export const PrintableBallotType = {
  Absentee: 'absentee',
  Precinct: 'standard',
} as const;
export type PrintableBallotType =
  typeof PrintableBallotType[keyof typeof PrintableBallotType];

export interface PrintedBallot {
  ballotStyleId: BallotStyle['id'];
  precinctId: Precinct['id'];
  locales: BallotLocale;
  numCopies: number;
  printedAt: Iso8601Timestamp;
  type: PrintableBallotType;
}

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: KioskBrowser.PrintSides;
}
export interface Printer {
  print(options: PrintOptions): Promise<void>;
}

// Router Props
export interface BallotScreenProps {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  localeCode?: string;
}
export interface PrecinctReportScreenProps {
  precinctId: PrecinctId;
}
export interface ScannerReportScreenProps {
  scannerId: string;
}
export interface BatchReportScreenProps {
  batchId: string;
}
export interface PartyReportScreenProps {
  partyId: string;
}
export interface VotingMethodReportScreenProps {
  votingMethod: string;
}
export interface ManualDataPrecinctScreenProps {
  precinctId: PrecinctId;
}

// Tallies
export interface ExportableContestTally {
  readonly tallies: Dictionary<number>;
  readonly metadata: ContestTallyMeta;
}
export type ExportableTally = Dictionary<ExportableContestTally>;
export interface ExportableTallies {
  readonly talliesByPrecinct: Dictionary<ExportableTally>;
}

export interface ExternalFileConfiguration {
  readonly file: File;
  readonly votingMethod: VotingMethod;
}

export enum ResultsFileType {
  CastVoteRecord = 'cvr',
  SEMS = 'sems',
  All = 'all',
  Manual = 'manual',
}
export type OptionalFile = Optional<File>;

// Cast Vote Records
export interface CastVoteRecord
  extends Dictionary<
    string | string[] | boolean | number | number[] | BallotLocale
  > {
  readonly _precinctId: PrecinctId;
  readonly _ballotId: BallotId;
  readonly _ballotStyleId: BallotStyleId;
  readonly _ballotType: 'absentee' | 'provisional' | 'standard';
  readonly _batchId: string;
  readonly _batchLabel: string;
  readonly _testBallot: boolean;
  readonly _scannerId: string;
  readonly _pageNumber?: number;
  readonly _pageNumbers?: number[];
  readonly _locales?: BallotLocale;
}

export type CastVoteRecordFileMode = 'test' | 'live';

export interface CastVoteRecordFile {
  readonly name: string;
  readonly importedCvrCount: number;
  readonly duplicatedCvrCount: number;
  readonly scannerIds: readonly string[];
  readonly precinctIds: readonly PrecinctId[];
  readonly exportTimestamp: Date;
  readonly isTestMode: boolean;
  readonly signature: string;
  readonly allCastVoteRecords?: CastVoteRecord[];
}
export interface CastVoteRecordFilePreprocessedData {
  readonly name: string;
  readonly newCvrCount: number;
  readonly importedCvrCount: number;
  readonly scannerIds: readonly string[];
  readonly exportTimestamp: Date;
  readonly isTestModeResults: boolean;
  readonly fileImported: boolean;
  readonly fileContent: string;
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>;

export type VoteCounts = Dictionary<Dictionary<number>>;
export type OptionalVoteCounts = Optional<Dictionary<Dictionary<number>>>;

export type Iso8601Timestamp = string;

export type ConverterClientType = 'ms-sems' | 'nh-accuvote';

export const ConverterClientTypeSchema = z.union([
  z.literal('ms-sems'),
  z.literal('nh-accuvote'),
]);

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export const MachineConfigSchema: z.ZodSchema<MachineConfig> = z.object({
  machineId: MachineId,
  codeVersion: z.string().nonempty(),
});
