import {
  BallotStyleId,
  Dictionary,
  PartyId,
  PrecinctId,
  PromiseOr,
} from '@votingworks/types';
import { Optional } from '@votingworks/basics';
import type { ManualResultsVotingMethod } from '@votingworks/admin-backend';

// Events
export type InputEventFunction = (
  event: React.FormEvent<HTMLInputElement>
) => PromiseOr<void>;
export type TextareaEventFunction = (
  event: React.FormEvent<HTMLTextAreaElement>
) => PromiseOr<void>;

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
  CastVoteRecord = 'cvr',
  All = 'all',
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
