import {
  BallotStyleId,
  CastVoteRecord,
  Dictionary,
  PartyId,
  PrecinctId,
  PromiseOr,
} from '@votingworks/types';
import { Optional, throwIllegalValue } from '@votingworks/basics';
import { z } from 'zod';
import type {
  BallotMode,
  ManualResultsVotingMethod,
} from '@votingworks/admin-backend';

// Events
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => PromiseOr<void>;
export type TextareaEventFunction = (
  event: React.FormEvent<HTMLTextAreaElement>
) => PromiseOr<void>;

export const PrintableBallotType = {
  Absentee: 'absentee',
  Precinct: 'standard',
} as const;
export type PrintableBallotType =
  typeof PrintableBallotType[keyof typeof PrintableBallotType];

export const PrintableBallotTypeSchema = z.union([
  z.literal('absentee'),
  z.literal('standard'),
]);

export function ballotModeToReadableString(ballotMode: BallotMode): string {
  switch (ballotMode) {
    case 'draft': {
      return 'Draft';
    }
    case 'official': {
      return 'Official';
    }
    case 'sample': {
      return 'Sample';
    }
    case 'test': {
      return 'Test';
    }
    /* istanbul ignore next: Compile-time check for completeness */
    default: {
      throwIllegalValue(ballotMode);
    }
  }
}

export interface PrintOptions extends KioskBrowser.PrintOptions {
  sides: KioskBrowser.PrintSides;
}
export interface Printer {
  print(options: PrintOptions): Promise<void>;
}

// Router Props
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
  partyId: PartyId;
}
export interface VotingMethodReportScreenProps {
  votingMethod: string;
}
export interface ManualDataEntryScreenProps {
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  votingMethod: ManualResultsVotingMethod;
}
export interface SmartcardsScreenProps {
  smartcardType: string;
}

export enum ResultsFileType {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  CastVoteRecord = 'cvr',
  All = 'all',
}
export type OptionalFile = Optional<File>;

export interface CastVoteRecordFile {
  readonly name: string;
  readonly importedCvrCount: number;
  readonly duplicatedCvrCount: number;
  readonly scannerIds: readonly string[];
  readonly precinctIds: readonly PrecinctId[];
  readonly allCastVoteRecords: readonly CastVoteRecord[];
  readonly exportTimestamp: Date;
}
export interface CastVoteRecordFilePreprocessedData {
  readonly name: string;
  readonly path: string;
  readonly cvrCount: number;
  readonly scannerIds: readonly string[];
  readonly exportTimestamp: Date;
  readonly isTestModeResults: boolean;
}

export type VoteCounts = Dictionary<Dictionary<number>>;
export type OptionalVoteCounts = Optional<Dictionary<Dictionary<number>>>;

export type Iso8601Timestamp = string;

export type SmartcardType = 'election' | 'system-administrator';
export const SmartcardTypeRegExPattern = '(election|system-administrator)';
