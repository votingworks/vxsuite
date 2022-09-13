import {
  ElectionDefinition,
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  Iso8601Timestamp,
} from '@votingworks/types';
import { PrintedBallot } from '../../config/types';
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
  loadElectionDefinitionAndConfiguredAt(): Promise<
    | { electionDefinition: ElectionDefinition; configuredAt: Iso8601Timestamp }
    | undefined
  >;

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
   * Loads the existing setting for whether the results are official.
   */
  loadIsOfficialResults(): Promise<boolean | undefined>;

  /**
   * Marks the results as official. No more tallies can be added after this.
   */
  markResultsOfficial(): Promise<void>;

  /**
   * Loads the existing printed ballots.
   */
  loadPrintedBallots(): Promise<PrintedBallot[] | undefined>;

  /**
   * Adds a new printed ballot to the list.
   */
  addPrintedBallot(printedBallot: PrintedBallot): Promise<void>;
}
