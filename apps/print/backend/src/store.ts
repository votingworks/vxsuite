//
// The durable datastore for configuration info.
//

import { UiStringsStore, createUiStringStore } from '@votingworks/backend';
import { assertDefined, DateWithoutTime } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger } from '@votingworks/logging';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
  SystemSettings,
  safeParseSystemSettings,
  ElectionKey,
  constructElectionKey,
} from '@votingworks/types';
import { join } from 'node:path';

const SchemaPath = join(__dirname, '../schema.sql');

/**
 * ElectionRecord represents election configuration in the store.
 */
export interface ElectionRecord {
  electionDefinition: ElectionDefinition;
  electionPackageHash: string;
}

/**
 * Manages a data store for imported election definition and system settings
 */
export class Store {
  private constructor(
    private readonly client: DbClient,
    private readonly uiStringsStore: UiStringsStore
  ) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    const client = DbClient.memoryClient(SchemaPath);
    const uiStringsStore = createUiStringStore(client);
    return new Store(client, uiStringsStore);
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static fileStore(dbPath: string, logger: BaseLogger): Store {
    const client = DbClient.fileClient(dbPath, logger, SchemaPath);
    const uiStringsStore = createUiStringStore(client);
    return new Store(client, uiStringsStore);
  }

  /**
   * Runs the given function in a transaction. If the function throws an error,
   * the transaction is rolled back. Otherwise, the transaction is committed.
   *
   * Returns the result of the function.
   */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  withTransaction<T>(fn: () => T): T;
  withTransaction<T>(fn: () => T): T {
    return this.client.transaction(() => fn());
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
   * Gets the current election definition and election package hash.
   */
  getElectionRecord(): ElectionRecord | undefined {
    const electionRow = this.client.one(
      `
      select
        election_data as electionData,
        election_package_hash as electionPackageHash
      from election
      `
    ) as { electionData: string; electionPackageHash: string } | undefined;

    return (
      electionRow && {
        electionDefinition: safeParseElectionDefinition(
          electionRow.electionData
        ).unsafeUnwrap(),
        electionPackageHash: electionRow.electionPackageHash,
      }
    );
  }

  /**
   * Retrieves the election key (used for auth) for the current election. This
   * method is faster than than {@link getElectionRecord} and thus more appropriate
   * for use during auth polling.
   */
  getElectionKey(): ElectionKey | undefined {
    const result = this.client.one(
      `
      select
        election_data ->> 'id' as id,
        election_data ->> 'date' as date
      from election
      `
    ) as { id?: string; date?: string } | undefined;

    if (!result) return undefined;

    // The election might be in CDF, in which case, we won't get `id` and `date`
    // fields, so just load and parse it to construct the key. We don't need to
    // optimize speed for CDF.
    if (!(result.id && result.date)) {
      return constructElectionKey(
        assertDefined(this.getElectionRecord()).electionDefinition.election
      );
    }

    return {
      id: result.id,
      date: new DateWithoutTime(result.date),
    };
  }

  /**
   * Gets the current jurisdiction.
   */
  getJurisdiction(): string | undefined {
    const electionRow = this.client.one('select jurisdiction from election') as
      | { jurisdiction: string }
      | undefined;
    return electionRow?.jurisdiction;
  }

  /**
   * Sets the current election definition and jurisdiction.
   */
  setElectionAndJurisdiction(input?: {
    electionData: string;
    jurisdiction: string;
    electionPackageHash: string;
  }): void {
    this.client.run('delete from election');
    if (input) {
      this.client.run(
        `
        insert into election (
          election_data,
          jurisdiction,
          election_package_hash
        ) values (?, ?, ?)
        `,
        input.electionData,
        input.jurisdiction,
        input.electionPackageHash
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
   * Stores the system settings.
   */
  setSystemSettings(systemSettings: SystemSettings): void {
    this.client.run('delete from system_settings');
    this.client.run(
      `
      insert into system_settings (data) values (?)
      `,
      JSON.stringify(systemSettings)
    );
  }

  /**
   * Retrieves the system settings.
   */
  getSystemSettings(): SystemSettings | undefined {
    const result = this.client.one(`select data from system_settings`) as
      | { data: string }
      | undefined;

    if (!result) return undefined;
    return safeParseSystemSettings(result.data).unsafeUnwrap();
  }
}
