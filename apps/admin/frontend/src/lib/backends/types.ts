import {
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
} from '@votingworks/types';

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
}
