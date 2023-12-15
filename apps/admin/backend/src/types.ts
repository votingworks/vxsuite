import {
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  ElectionDefinitionSchema,
  Id,
  IdSchema,
  Iso8601Timestamp,
  Iso8601TimestampSchema,
  Rect,
  CandidateId,
  PrecinctId,
  BallotStyleId,
  Tabulation,
  ReadCastVoteRecordExportError,
  ReadCastVoteRecordError,
} from '@votingworks/types';
import * as z from 'zod';

export type { ExportDataResult, ExportDataError } from '@votingworks/backend';

/**
 * Environment variables that identify the machine and its software. Set at the
 * machine-level rather than the at the software-level.
 */
export interface MachineConfig {
  machineId: string;
  codeVersion: string;
}

/**
 * Metadata about a cast vote record file found on a USB drive.
 */
export interface CastVoteRecordFileMetadata {
  readonly name: string;
  readonly path: string;
  readonly cvrCount: number;
  readonly scannerIds: readonly string[];
  readonly exportTimestamp: Date;
  readonly isTestModeResults: boolean;
}

/**
 * Most basic information about a scanner batch.
 */
export interface ScannerBatch extends Tabulation.ScannerBatch {
  label: string;
  electionId: string;
}

/**
 * Lookup dictionary for batches, necessary to make many operations efficient.
 */
export type ScannerBatchLookup = Record<string, ScannerBatch>;

/**
 * An election definition and associated DB metadata.
 */
export interface ElectionRecord {
  readonly id: Id;
  readonly electionDefinition: ElectionDefinition;
  readonly createdAt: Iso8601Timestamp;
  readonly isOfficialResults: boolean;
}

/**
 * Schema for {@link ElectionRecord}.
 */
export const ElectionRecordSchema: z.ZodSchema<ElectionRecord> = z.object({
  id: IdSchema,
  electionDefinition: ElectionDefinitionSchema,
  createdAt: Iso8601TimestampSchema,
  isOfficialResults: z.boolean(),
});

/**
 * Info related to a CVR file import attempt.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type CvrFileImportInfo = {
  id: Id;
  alreadyPresent: number;
  exportedTimestamp: Iso8601Timestamp;
  fileMode: CvrFileMode;
  fileName: string;
  newlyAdded: number;
  wasExistingFile: boolean;
};

/**
 * A cast vote record file's metadata.
 */
export interface CastVoteRecordFileRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly filename: string;
  readonly exportTimestamp: Iso8601Timestamp;
  readonly numCvrsImported: number;
  readonly precinctIds: string[];
  readonly scannerIds: string[];
  readonly sha256Hash: string;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link CastVoteRecordFileRecord}.
 */
export const CastVoteRecordFileRecordSchema: z.ZodSchema<CastVoteRecordFileRecord> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    filename: z.string().nonempty(),
    exportTimestamp: Iso8601TimestampSchema,
    numCvrsImported: z.number(),
    precinctIds: z.array(z.string()),
    scannerIds: z.array(z.string()),
    sha256Hash: z.string().nonempty(),
    createdAt: Iso8601TimestampSchema,
  });

/**
 * A Cast Vote Record's metadata.
 */
export interface CastVoteRecordFileEntryRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly data: string;
  readonly createdAt: Iso8601Timestamp;
}

/**
 * Schema for {@link CastVoteRecordFileEntryRecord}.
 */
export const CastVoteRecordFileEntryRecordSchema: z.ZodSchema<CastVoteRecordFileEntryRecord> =
  z.object({
    id: IdSchema,
    electionId: IdSchema,
    data: z.string(),
    createdAt: Iso8601TimestampSchema,
  });

/**
 * Details about a candidate added through write-in adjudication.
 */
export interface WriteInCandidateRecord {
  readonly id: Id;
  readonly electionId: Id;
  readonly contestId: ContestId;
  readonly name: string;
}

interface WriteInRecordBase {
  readonly id: Id;
  readonly contestId: ContestId;
  readonly optionId: ContestOptionId;
  readonly cvrId: Id;
  readonly electionId: Id;
  readonly isUnmarked?: boolean;
}

/**
 * A write-in that is not yet adjudicated.
 */
export interface WriteInRecordPending extends WriteInRecordBase {
  readonly status: 'pending';
}

interface WriteInRecordAdjudicatedBase extends WriteInRecordBase {
  readonly status: 'adjudicated';
}

/**
 * A write-in that has been adjudicated for an official candidate.
 */
export interface WriteInRecordAdjudicatedOfficialCandidate
  extends WriteInRecordAdjudicatedBase {
  readonly adjudicationType: 'official-candidate';
  readonly candidateId: CandidateId;
}

/**
 * A write-in that has been adjudicated for a write-in candidate.
 */
export interface WriteInRecordAdjudicatedWriteInCandidate
  extends WriteInRecordAdjudicatedBase {
  readonly adjudicationType: 'write-in-candidate';
  readonly candidateId: string;
}

/**
 * A write-in that has been adjudicated as invalid.
 */
export interface WriteInRecordAdjudicatedInvalid
  extends WriteInRecordAdjudicatedBase {
  readonly adjudicationType: 'invalid';
}

/**
 * A write-in that has been adjudicated.
 */
export type WriteInRecordAdjudicated =
  | WriteInRecordAdjudicatedOfficialCandidate
  | WriteInRecordAdjudicatedWriteInCandidate
  | WriteInRecordAdjudicatedInvalid;

/**
 * Information about a write-in that has or has not been adjudicated.
 */
export type WriteInRecord = WriteInRecordPending | WriteInRecordAdjudicated;

/**
 * Status values for a write-in or write-in summary - either pending or adjudicated.
 */
export type WriteInAdjudicationStatus = WriteInRecord['status'];

/**
 * Types of write-in adjudications - for an official candidate, a write-in
 * candidate, or to mark it as invalid.
 */
export type WriteInAdjudicationType =
  WriteInRecordAdjudicated['adjudicationType'];

/**
 * Write-in summary information for non-adjudicated records.
 */
export interface WriteInPendingTally {
  readonly status: 'pending';
  readonly contestId: ContestId;
  readonly tally: number;
}

interface WriteInAdjudicatedTallyBase {
  readonly status: 'adjudicated';
  readonly contestId: ContestId;
  readonly tally: number;
}

/**
 * Write-in summary information for write-ins adjudicated for an official candidate.
 */
export interface WriteInAdjudicatedOfficialCandidateTally
  extends WriteInAdjudicatedTallyBase {
  readonly adjudicationType: 'official-candidate';
  readonly candidateId: CandidateId;
  readonly candidateName: string;
}

/**
 * Write-in summary information for write-ins adjudicated for a write-in candidate.
 */
export interface WriteInAdjudicatedWriteInCandidateTally
  extends WriteInAdjudicatedTallyBase {
  readonly adjudicationType: 'write-in-candidate';
  readonly candidateId: string;
  readonly candidateName: string;
}

/**
 * Write-in summary information for write-ins adjudicated as invalid.
 */
export interface WriteInAdjudicatedInvalidTally
  extends WriteInAdjudicatedTallyBase {
  readonly adjudicationType: 'invalid';
}

/**
 * Write-in summary information for adjudicated write-ins.
 */
export type WriteInAdjudicatedTally =
  | WriteInAdjudicatedOfficialCandidateTally
  | WriteInAdjudicatedWriteInCandidateTally
  | WriteInAdjudicatedInvalidTally;

/**
 * Write-in summary information.
 */
export type WriteInTally = WriteInPendingTally | WriteInAdjudicatedTally;

/**
 * Description of the write-in adjudication queue size.
 */
export interface WriteInAdjudicationQueueMetadata {
  contestId: ContestId;
  pendingTally: number;
  totalTally: number;
}

/**
 * Information necessary to adjudicate a write-in for an official candidate.
 */
export interface WriteInAdjudicationActionOfficialCandidate {
  writeInId: Id;
  type: 'official-candidate';
  candidateId: CandidateId;
}

/**
 * Information necessary to adjudicate a write-in for a write-in candidate.
 */
export interface WriteInAdjudicationActionWriteInCandidate {
  writeInId: Id;
  type: 'write-in-candidate';
  candidateId: string;
}

/**
 * Information necessary to adjudicate a write-in as invalid.
 */
export interface WriteInAdjudicationActionInvalid {
  writeInId: Id;
  type: 'invalid';
}

/**
 * Information necessary to reset a write-in to pending.
 */
export interface WriteInAdjudicationActionReset {
  writeInId: Id;
  type: 'reset';
}

/**
 * Information necessary to adjudicate a write-in.
 */
export type WriteInAdjudicationAction =
  | WriteInAdjudicationActionOfficialCandidate
  | WriteInAdjudicationActionWriteInCandidate
  | WriteInAdjudicationActionInvalid
  | WriteInAdjudicationActionReset;

/**
 * Information necessary to display a write-in on the frontend.
 */
export interface WriteInImageView {
  readonly writeInId: Id;
  readonly cvrId: Id;
  readonly imageUrl: string;
  readonly ballotCoordinates: Rect;
  readonly contestCoordinates: Rect;
  readonly writeInCoordinates: Rect;
}

/**
 * Information necessary to adjudicate a write-in including the write-in record,
 * any related write-in records (same ballot and contest), and the CVR votes.
 */
export interface WriteInAdjudicationContext {
  readonly writeIn: WriteInRecord;
  /**
   * Related write-ins are write-ins that are on the same ballot and in the same
   * contest as the primary write-in.
   */
  readonly relatedWriteIns: WriteInRecord[];
  readonly cvrId: Id;
  readonly cvrVotes: Tabulation.Votes;
}

/**
 * An adjudication that creates a mark where one was not previously tabulated
 * or removes a mark that was previously tabulated.
 */
export interface VoteAdjudication {
  electionId: Id;
  cvrId: Id;
  contestId: Id;
  optionId: Id;
  isVote: boolean;
}

/**
 * Top-level adjudication information about a cast vote record.
 */
export interface CastVoteRecordVoteInfo {
  id: Id;
  electionId: Id;
  votes: Tabulation.CastVoteRecord['votes'];
}

/**
 * Ballot mode.
 */
export type BallotMode =
  /** Official ballots to be used and scanned during an election */
  | 'official'
  /** Test ballots to be used and scanned during pre-election testing / L&A */
  | 'test'
  /** Sample ballots to be provided to voters ahead of an election */
  | 'sample'
  /** Draft ballots to verify that an election definition has been properly configured */
  | 'draft';

/**
 * The ballot type for the CVR files currently being handled.
 */
export type CvrFileMode =
  /** Only working with official CVR files generated during an official election. */
  | 'official'
  /** Only working with test CVR files used during pre-election testing / L&A. */
  | 'test'
  /** No CVR files imported yet - file mode is not currently locked. */
  | 'unlocked';

/**
 * Ballot types for which we allow adding manual results.
 */
export type ManualResultsVotingMethod = Extract<
  Tabulation.VotingMethod,
  'absentee' | 'precinct'
>;

/**
 * Attributes which uniquely identify manual results within an election due
 * to the levels of granularity we do or don't support.
 */
export interface ManualResultsIdentifier {
  precinctId: PrecinctId;
  ballotStyleId: BallotStyleId;
  votingMethod: ManualResultsVotingMethod;
}

/**
 * Manual results as they are represented in the store.
 */
export interface ManualResultsRecord extends ManualResultsIdentifier {
  manualResults: Tabulation.ManualElectionResults;
  createdAt: Iso8601Timestamp;
}

/**
 * Ballot count summary of a manual results record.
 */
export interface ManualResultsMetadataRecord extends ManualResultsIdentifier {
  ballotCount: number;
  createdAt: Iso8601Timestamp;
}

/**
 * Subset of cast vote record filters that we can filter on for manual results.
 */
export type ManualResultsFilter = Omit<
  Tabulation.Filter,
  'scannerIds' | 'batchIds'
>;

/**
 * A count of a specific kind of card. For representation of aggregate values
 * pulled from the store.
 */
export interface CardTally {
  card: Tabulation.Card;
  tally: number;
}

/**
 * For primary reports, we need card counts split by party.
 */
export type CardCountsByParty = Record<string, Tabulation.CardCounts>;

interface TallyReportResultsBase {
  contestIds: ContestId[];
  scannedResults: Tabulation.ElectionResults;
  manualResults?: Tabulation.ManualElectionResults;
}

/**
 * Results for a tally report not split by party, usually for a general or
 * as a data intermediate in tabulation code.
 */
export type SingleTallyReportResults = TallyReportResultsBase & {
  hasPartySplits: false;
  cardCounts: Tabulation.CardCounts;
};

/**
 * Results for a tally report split by party, used for primary elections.
 */
export type PartySplitTallyReportResults = TallyReportResultsBase & {
  hasPartySplits: true;
  cardCountsByParty: CardCountsByParty;
};

/**
 * Data necessary to display a frontend tally report.
 */
export type TallyReportResults =
  | SingleTallyReportResults
  | PartySplitTallyReportResults;

/**
 * An error involving the correspondence between the fields in a cast vote record and the election
 * definition
 */
export type CastVoteRecordElectionDefinitionValidationError = {
  type: 'invalid-cast-vote-record';
} & (
  | { subType: 'ballot-style-not-found' }
  | { subType: 'contest-not-found' }
  | { subType: 'contest-option-not-found' }
  | { subType: 'election-mismatch' }
  | { subType: 'precinct-not-found' }
);

type WithIndex<T> = T & { index: number };

/**
 * An error encountered while importing cast vote records
 */
export type ImportCastVoteRecordsError =
  | ReadCastVoteRecordExportError
  | WithIndex<ReadCastVoteRecordError>
  | WithIndex<CastVoteRecordElectionDefinitionValidationError>
  | { type: 'invalid-mode'; currentMode: 'official' | 'test' }
  | WithIndex<{ type: 'ballot-id-already-exists-with-different-data' }>;
