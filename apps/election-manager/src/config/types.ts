import {
  BallotLocale,
  BallotStyle,
  ContestTallyMeta,
  Dictionary,
  Optional,
  Precinct,
  VotingMethod,
} from '@votingworks/types';
import { BallotStyleData } from '@votingworks/utils';

// Events
export type EventTargetFunction = (event: React.FormEvent<EventTarget>) => void;
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => void | Promise<void>;
export type TextareaEventFunction = (
  event: React.FormEvent<HTMLTextAreaElement>
) => void | Promise<void>;
export type ButtonEventFunction = (
  event: React.MouseEvent<HTMLButtonElement>
) => void | Promise<void>;

// Election
export type SaveElection = (electionJSON?: string) => Promise<void>;

export interface BallotConfig extends BallotStyleData {
  filename: string;
  locales: BallotLocale;
  isLiveMode: boolean;
  isAbsentee: boolean;
}

export const PrintableBallotType = {
  Absentee: 'absentee',
  Precinct: 'standard',
} as const;
export type PrintableBallotType = typeof PrintableBallotType[keyof typeof PrintableBallotType];

export interface PrintedBallot {
  ballotStyleId: BallotStyle['id'];
  precinctId: Precinct['id'];
  locales: BallotLocale;
  numCopies: number;
  printedAt: ISO8601Timestamp;
  type: PrintableBallotType;
}

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: Exclude<KioskBrowser.PrintOptions['sides'], undefined>;
}
export interface Printer {
  print(options: PrintOptions): Promise<void>;
}

// Router Props
export interface BallotScreenProps {
  ballotStyleId: string;
  precinctId: string;
  localeCode?: string;
}
export interface PrecinctReportScreenProps {
  precinctId: string;
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
  precinctId: string;
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
  readonly _precinctId: string;
  readonly _ballotId: string;
  readonly _ballotStyleId: string;
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

export type CastVoteRecordLists = ReadonlyArray<ReadonlyArray<CastVoteRecord>>;

export interface CastVoteRecordFile {
  readonly name: string;
  readonly count: number;
  readonly scannerIds: readonly string[];
  readonly precinctIds: readonly string[];
  readonly exportTimestamp: Date;
}
export type CastVoteRecordFilesDictionary = Dictionary<CastVoteRecordFile>;

export type VoteCounts = Dictionary<Dictionary<number>>;
export type OptionalVoteCounts = Optional<Dictionary<Dictionary<number>>>;

export type ISO8601Timestamp = string;

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
  bypassAuthentication: boolean;
}
