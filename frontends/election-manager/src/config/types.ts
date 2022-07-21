import {
  BallotLocales,
  BallotStyle,
  BallotStyleId,
  CastVoteRecord,
  ContestTallyMeta,
  Dictionary,
  MachineId,
  Optional,
  Precinct,
  PrecinctId,
  PromiseOr,
  VotingMethod,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
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

export enum BallotMode {
  /** Real ballots to be used and scanned during an election */
  Official = 'live',
  /** Test ballots to be used and scanned during pre-election testing / L&A */
  Test = 'test',
  /** Sample ballots to be provided to voters ahead of an election */
  Sample = 'sample',
  /** Draft ballots to verify that an election definition has been properly configured */
  Draft = 'draft',
}

export function ballotModeToReadableString(ballotMode: BallotMode): string {
  switch (ballotMode) {
    case BallotMode.Draft: {
      return 'Draft';
    }
    case BallotMode.Official: {
      return 'Official';
    }
    case BallotMode.Sample: {
      return 'Sample';
    }
    case BallotMode.Test: {
      return 'Test';
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(ballotMode);
    }
  }
}

export interface PrintedBallot {
  ballotStyleId: BallotStyle['id'];
  precinctId: Precinct['id'];
  locales: BallotLocales;
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
export interface SmartcardsScreenProps {
  smartcardType: string;
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
  // eslint-disable-next-line @typescript-eslint/no-shadow
  CastVoteRecord = 'cvr',
  SEMS = 'sems',
  All = 'all',
  Manual = 'manual',
}
export type OptionalFile = Optional<File>;

export type CastVoteRecordFileMode = 'test' | 'live';

export interface CastVoteRecordFile {
  readonly name: string;
  readonly importedCvrCount: number;
  readonly duplicatedCvrCount: number;
  readonly scannerIds: readonly string[];
  readonly precinctIds: readonly PrecinctId[];
  readonly allCastVoteRecords: readonly CastVoteRecord[];
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

export type SmartcardType = 'election' | 'system-administrator';
export const SmartcardTypeRegExPattern = '(election|system-administrator)';

export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

export const MachineConfigSchema: z.ZodSchema<MachineConfig> = z.object({
  machineId: MachineId,
  codeVersion: z.string().nonempty(),
});
