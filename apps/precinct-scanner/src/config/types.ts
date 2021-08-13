import type { AdjudicationReasonInfo, Dictionary } from '@votingworks/types'

export enum BallotState {
  IDLE = 'idle',
  SCANNING = 'scanning',
  NEEDS_REVIEW = 'needs_review', // the voter needs to decide whether to reject or cast a ballot
  CAST = 'ballot_cast',
  REJECTED = 'ballot_rejected',
  SCANNER_ERROR = 'error',
}

export enum ScanningResultType {
  Accepted = 'accepted',
  Rejected = 'rejected',
  NeedsReview = 'needs-review',
}

export enum RejectedScanningReason {
  InvalidTestMode = 'invalid_test_mode',
  InvalidElectionHash = 'invalid_election_hash',
  InvalidPrecinct = 'invalid_precinct',
  Unreadable = 'unreadable',
  Unknown = 'unknown',
}

export type ScanningResult =
  | AcceptedScanningResult
  | RejectedScanningResult
  | ScanningResultNeedsReview

export interface AcceptedScanningResult {
  resultType: ScanningResultType.Accepted
}

export interface RejectedScanningResult {
  resultType: ScanningResultType.Rejected
  rejectionReason: RejectedScanningReason
}

export interface ScanningResultNeedsReview {
  resultType: ScanningResultType.NeedsReview
  adjudicationReasonInfo: AdjudicationReasonInfo[]
}

export interface MachineConfig {
  machineId: string
  codeVersion: string
}

// Scanner Types
export interface CastVoteRecord
  extends Dictionary<string | string[] | boolean> {
  _precinctId: string
  _ballotStyleId: string
  _ballotType: 'absentee' | 'provisional' | 'standard'
  _ballotId: string
  _testBallot: boolean
  _scannerId: string
}
