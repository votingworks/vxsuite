import {
  ElectionDefinition,
  FullElectionExternalTally,
  Iso8601Timestamp,
} from '@votingworks/types';
import { PrintedBallot } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';

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
   * Overwrites the existing cast vote record files with the given ones.
   */
  setCastVoteRecordFiles(
    newCastVoteRecordFiles: CastVoteRecordFiles
  ): Promise<void>;

  /**
   * Resets all cast vote record files.
   */
  clearCastVoteRecordFiles(): Promise<void>;

  /**
   * Loads the existing external tallies.
   */
  loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTally[] | undefined
  >;

  /**
   * Adds an external tally to the list.
   */
  addFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Replaces all external tallies with the given ones.
   */
  setFullElectionExternalTallies(
    newFullElectionExternalTallies: readonly FullElectionExternalTally[]
  ): Promise<void>;

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
