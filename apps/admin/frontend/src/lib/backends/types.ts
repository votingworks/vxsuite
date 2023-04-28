import { FullElectionManualTally } from '@votingworks/types';

export interface AddCastVoteRecordFileResult {
  readonly wasExistingFile: boolean;
  readonly newlyAdded: number;
  readonly alreadyPresent: number;
}

/**
 * @deprecated these should be moved to `api.ts` as react-query hooks
 */
export interface ElectionManagerStoreBackend {
  /**
   * Loads the existing manual tallies.
   */
  loadFullElectionManualTally(): Promise<FullElectionManualTally | undefined>;

  /**
   * Updates the manual tally for a given source.
   */
  updateFullElectionManualTally(
    newFullElectionManualTally: FullElectionManualTally
  ): Promise<void>;

  /**
   * Removes the manual tally for a given source.
   */
  removeFullElectionManualTally(): Promise<void>;
}
