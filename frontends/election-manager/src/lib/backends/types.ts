import { Admin } from '@votingworks/api';
import {
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Id,
} from '@votingworks/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';

export interface AddCastVoteRecordFileResult {
  readonly wasExistingFile: boolean;
  readonly newlyAdded: number;
  readonly alreadyPresent: number;
}

export interface ElectionManagerStoreBackend {
  /**
   * Resets all stored data, including the election definition and CVRs.
   */
  reset(): Promise<void>;

  /**
   * Loads the existing election definition, if there is one.
   */
  loadCurrentElectionMetadata(): Promise<Admin.ElectionRecord | undefined>;

  /**
   * Configures with a new election definition after resetting.
   *
   * @param newElectionData election definition as JSON string
   */
  configure(newElectionData: string): Promise<ElectionDefinition>;

  /**
   * Loads the existing cast vote record files.
   */
  loadCastVoteRecordFiles(): Promise<CastVoteRecordFiles | undefined>;

  /**
   * Adds a new cast vote record file.
   */
  addCastVoteRecordFile(
    newCastVoteRecordFile: File
  ): Promise<AddCastVoteRecordFileResult>;

  /**
   * Resets all cast vote record files.
   */
  clearCastVoteRecordFiles(): Promise<void>;

  /**
   * Loads the existing external tallies.
   */
  loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTallies | undefined
  >;

  /**
   * Updates the external tally for a given source.
   */
  updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Removes the external tally for a given source.
   */
  removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void>;

  /**
   * Clears all external tallies.
   */
  clearFullElectionExternalTallies(): Promise<void>;

  /**
   * Marks the results as official. No more tallies can be added after this.
   */
  markResultsOfficial(): Promise<void>;

  /**
   * Loads the existing printed ballots.
   */
  loadPrintedBallots(options?: {
    ballotMode?: Admin.BallotMode;
  }): Promise<Admin.PrintedBallotRecord[]>;

  /**
   * Adds a new printed ballot to the list.
   */
  addPrintedBallot(printedBallot: Admin.PrintedBallot): Promise<Id>;

  /**
   * Loads all write-in records filtered appropriately.
   */
  loadWriteIns(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInRecord[]>;

  /**
   * Loads all write-in image for a CVR.
   */
  loadWriteInImage(cvrId: string): Promise<Admin.WriteInImageEntry[]>;

  /**
   * Transcribes a write-in record.
   */
  transcribeWriteIn(writeInId: Id, transcribedValue: string): Promise<void>;

  /**
   * Gets all the write-in adjudications, optionally filtered by contest.
   */
  loadWriteInAdjudications(options?: {
    contestId?: ContestId;
  }): Promise<Admin.WriteInAdjudicationRecord[]>;

  /**
   * Adjudicates a write-in transcription.
   */
  adjudicateWriteInTranscription(
    contestId: ContestId,
    transcribedValue: string,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<Id>;

  /**
   * Updates a write-in adjudication.
   */
  updateWriteInAdjudication(
    writeInAdjudicationId: Id,
    adjudicatedValue: string,
    adjudicatedOptionId?: ContestOptionId
  ): Promise<void>;

  /**
   * Deletes a write-in adjudication.
   */
  deleteWriteInAdjudication(writeInAdjudicationId: Id): Promise<void>;

  /**
   * Gets a summary of all the write-ins, optionally filtered by contest.
   */
  getWriteInSummary(options?: {
    contestId?: ContestId;
    status?: Admin.WriteInAdjudicationStatus;
  }): Promise<Admin.WriteInSummaryEntry[]>;

  /**
   * Gets the write-in adjudication table for a given contest.
   */
  getWriteInAdjudicationTable(
    contestId: ContestId
  ): Promise<Admin.WriteInAdjudicationTable>;
}
