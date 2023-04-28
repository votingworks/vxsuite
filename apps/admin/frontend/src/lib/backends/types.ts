import { FullElectionExternalTally } from '@votingworks/types';

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
   * Loads the existing external tallies.
   */
  loadFullElectionExternalTally(): Promise<
    FullElectionExternalTally | undefined
  >;

  /**
   * Updates the external tally for a given source.
   */
  updateFullElectionExternalTally(
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void>;

  /**
   * Removes the external tally for a given source.
   */
  removeFullElectionExternalTally(): Promise<void>;
}
