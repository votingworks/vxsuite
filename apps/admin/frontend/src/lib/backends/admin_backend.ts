import { assert } from '@votingworks/basics';
import { LogEventId, Logger, LoggingUserRole } from '@votingworks/logging';
import {
  ExternalTallySourceType,
  FullElectionExternalTallies,
  FullElectionExternalTally,
  safeParse,
} from '@votingworks/types';
import { Storage } from '@votingworks/utils';
import { z } from 'zod';
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from '../../utils/external_tallies';
import { ElectionManagerStoreBackend } from './types';

const externalVoteTalliesFileStorageKey = 'externalVoteTallies';

/** @visibleForTesting */
export const currentElectionIdStorageKey = 'currentElectionId';

/**
 * Backend for storing election data.
 *
 * Note that some of this is still using local storage, but that will be
 * replaced with the `admin` service.
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

  async loadFullElectionExternalTallies(): Promise<
    FullElectionExternalTallies | undefined
  > {
    const serializedExternalTallies = safeParse(
      z.string().optional(),
      await this.storage.get(externalVoteTalliesFileStorageKey)
    ).ok();

    if (serializedExternalTallies) {
      const importedData = convertStorageStringToExternalTallies(
        serializedExternalTallies
      );
      await this.logger.log(LogEventId.LoadFromStorage, 'system', {
        message:
          'External file format vote tally data automatically loaded into application from local storage.',
        disposition: 'success',
        importedTallyFileNames: importedData
          .map((d) => d.inputSourceName)
          .join(', '),
      });
      return new Map(importedData.map((d) => [d.source, d]));
    }
  }

  async updateFullElectionExternalTally(
    sourceType: ExternalTallySourceType,
    newFullElectionExternalTally: FullElectionExternalTally
  ): Promise<void> {
    const newFullElectionExternalTallies = new Map(
      await this.loadFullElectionExternalTallies()
    );
    newFullElectionExternalTallies.set(
      sourceType,
      newFullElectionExternalTally
    );
    await this.setStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      convertExternalTalliesToStorageString(newFullElectionExternalTallies),
      `Updated external tally from source: ${newFullElectionExternalTally.source}`
    );
  }

  async removeFullElectionExternalTally(
    sourceType: ExternalTallySourceType
  ): Promise<void> {
    const newFullElectionExternalTallies = new Map(
      await this.loadFullElectionExternalTallies()
    );
    newFullElectionExternalTallies.delete(sourceType);
    await this.setStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      convertExternalTalliesToStorageString(newFullElectionExternalTallies),
      `Removed external tally from source: ${sourceType}`
    );
  }

  async clearFullElectionExternalTallies(): Promise<void> {
    await this.removeStorageKeyAndLog(
      externalVoteTalliesFileStorageKey,
      'Cleared all external tallies'
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
