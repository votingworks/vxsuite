import { BallotStyleId, ContestId, PrecinctId } from '@votingworks/types';

/**
 * How `types-rs` serializes a candidate selection. Write-ins carry the name
 * that was typed; named candidates carry only their ID.
 */
export type RustCandidateVote =
  | { type: 'namedCandidate'; candidateId: string }
  | { type: 'writeInCandidate'; candidateId: string; name: string };

/**
 * How `types-rs` serializes one contest's selections. The shape is tagged by
 * contest type, unlike the TypeScript `VotesDict`, which infers it.
 */
export type RustContestVote =
  | { type: 'candidate'; value: RustCandidateVote[] }
  | { type: 'yesNo'; value: string[] }
  | { type: 'straightParty'; value: string[] };

/**
 * How `types-rs` serializes one page of a summary ballot. The ballot hash is
 * the partial hash only, as a byte array.
 */
export interface RustCastVoteRecord {
  ballotHash: number[];
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  pageNumber: number;
  totalPages: number;
  isTestMode: boolean;
  ballotType: string;
  ballotAuditId: string;
  contestIds: ContestId[];
  votes: Record<ContestId, RustContestVote>;
}

/**
 * How `types-rs` serializes bubble ballot page metadata. The ballot hash is the
 * partial hash only, as a hex string.
 */
export interface RustBubbleBallotMetadata {
  ballotHash: string;
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  pageNumber: number;
  isTestMode: boolean;
  ballotType: string;
  ballotAuditId?: string;
}
