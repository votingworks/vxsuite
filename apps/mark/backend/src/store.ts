//
// The durable datastore for configuration info.
//

import { Client as DbClient } from '@votingworks/db';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
  SystemSettings,
  SystemSettingsDbRow,
} from '@votingworks/types';
import { join } from 'path';

const SchemaPath = join(__dirname, '../schema.sql');

/**
 * Manages a data store for imported election definition and system settings
 */
export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    return new Store(DbClient.memoryClient(SchemaPath));
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string): Store {
    return new Store(DbClient.fileClient(dbPath, SchemaPath));
  }

  /**
   * Resets the database and any cached data in the store.
   */
  reset(): void {
    this.client.reset();
  }

  /**
   * Gets whether an election is currently configured.
   */
  hasElection(): boolean {
    return Boolean(this.client.one('select id from election'));
  }

  /**
   * Gets the current election definition.
   */
  getElectionDefinition(): ElectionDefinition | undefined {
    const electionRow = this.client.one(
      'select election_data as electionData from election'
    ) as { electionData: string } | undefined;

    if (!electionRow?.electionData) {
      return undefined;
    }

    const electionDefinitionParseResult = safeParseElectionDefinition(
      electionRow.electionData
    );

    if (electionDefinitionParseResult.isErr()) {
      throw new Error('Unable to parse stored election data.');
    }

    const electionDefinition = electionDefinitionParseResult.ok();

    return {
      ...electionDefinition,
      election: {
        ...electionDefinition.election,
      },
    };
  }

  /**
   * Sets the current election definition.
   */
  setElection(electionData?: string): void {
    this.client.run('delete from election');
    if (electionData) {
      this.client.run(
        'insert into election (election_data) values (?)',
        electionData
      );
    }
  }

  /**
   * Deletes system settings
   */
  deleteSystemSettings(): void {
    this.client.run('delete from system_settings');
  }

  /**
   * Creates a system settings record
   */
  setSystemSettings(systemSettings: SystemSettings): void {
    this.client.run('delete from system_settings');
    this.client.run(
      'insert into system_settings (are_poll_worker_card_pins_enabled) values (?)',
      systemSettings.arePollWorkerCardPinsEnabled ? 1 : 0 // No booleans in sqlite3
    );
  }

  /**
   * Gets system settings or undefined if they aren't loaded yet
   */
  getSystemSettings(): SystemSettings | undefined {
    const result = this.client.one(
      `
      select
        are_poll_worker_card_pins_enabled as arePollWorkerCardPinsEnabled
      from system_settings
    `
    ) as SystemSettingsDbRow | undefined;

    if (!result) {
      return undefined;
    }

    return {
      arePollWorkerCardPinsEnabled: result.arePollWorkerCardPinsEnabled === 1,
    };
  }
}
