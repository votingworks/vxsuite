import { assert } from '@votingworks/basics';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import { FullElectionManualTally, safeParse } from '@votingworks/types';
import { Storage } from '@votingworks/utils';
import { z } from 'zod';
import {
  convertManualTallyToStorageString,
  convertStorageStringToManualTally,
} from '../../utils/manual_tallies';
import { ElectionManagerStoreBackend } from './types';

const manualVoteTallyFileStorageKey = 'manualVoteTally';

/** @visibleForTesting */
export const currentElectionIdStorageKey = 'currentElectionId';

/**
 * Backend for storing election data.
 *
 * Note that some of this is still using local storage, but that will be
 * replaced with the `admin` service.
 *
 * @deprecated these should be moved to `api.ts` as react-query hooks
 */
export class ElectionManagerStoreAdminBackend
  implements ElectionManagerStoreBackend
{
  private readonly storage: Storage;
  private readonly logger: Logger;
  private readonly currentUserRole: LoggingUserRole;

  constructor({
    storage,
    logger,
    currentUserRole,
  }: {
    storage: Storage;
    logger: Logger;
    currentUserRole?: LoggingUserRole;
  }) {
    this.storage = storage;
    this.logger = logger;
    this.currentUserRole = currentUserRole ?? 'unknown';
  }

  async loadFullElectionManualTally(): Promise<
    FullElectionManualTally | undefined
  > {
    const serializedManualTally = safeParse(
      z.string().optional(),
      await this.storage.get(manualVoteTallyFileStorageKey)
    ).ok();

    if (serializedManualTally) {
      const importedData = convertStorageStringToManualTally(
        serializedManualTally
      );
      await this.logger.log(LogEventId.LoadFromStorage, 'system', {
        message:
          'Manual vote tally data automatically loaded into application from local storage.',
        disposition: 'success',
      });
      return importedData;
    }
  }

  async updateFullElectionManualTally(
    newFullElectionManualTally: FullElectionManualTally
  ): Promise<void> {
    await this.setStorageKeyAndLog(
      manualVoteTallyFileStorageKey,
      convertManualTallyToStorageString(newFullElectionManualTally),
      `Added or updated manual tally.`
    );
  }

  async removeFullElectionManualTally(): Promise<void> {
    await this.removeStorageKeyAndLog(
      manualVoteTallyFileStorageKey,
      'Cleared manual tally.'
    );
  }

  private async setStorageKeyAndLog(
    storageKey: string,
    value: unknown,
    logDescription: string
  ): Promise<void> {
    try {
      await this.storage.set(storageKey, value);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `${logDescription} successfully saved to storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `Failed to save ${logDescription} to storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }

  private async removeStorageKeyAndLog(
    storageKey: string,
    logDescription: string
  ): Promise<void> {
    try {
      await this.storage.remove(storageKey);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `${logDescription} successfully cleared in storage.`,
        storageKey,
        disposition: 'success',
      });
    } catch (error) {
      assert(error instanceof Error);
      await this.logger.log(LogEventId.SaveToStorage, this.currentUserRole, {
        message: `Failed to clear ${logDescription} in storage.`,
        storageKey,
        error: error.message,
        disposition: 'failure',
      });
    }
  }
}
