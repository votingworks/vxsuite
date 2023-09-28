//
// The durable datastore for configuration info.
//

import { UiStringsStore, createUiStringStore } from '@votingworks/backend';
import { Optional } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import {
  ElectionDefinition,
  PrecinctSelection,
  PrecinctSelectionSchema,
  safeParseElectionDefinition,
  safeParseJson,
  SystemSettings,
  safeParseSystemSettings,
} from '@votingworks/types';
import { join } from 'path';

const SchemaPath = join(__dirname, '../schema.sql');

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
  static fileStore(dbPath: string): Store {
    const client = DbClient.fileClient(dbPath, SchemaPath);
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
   * Gets the current jurisdiction.
   */
  getJurisdiction(): string | undefined {
    const electionRow = this.client.one('select jurisdiction from election') as
      | { jurisdiction: string }
      | undefined;
    return electionRow?.jurisdiction;
  }

  /**
   * Sets the current precinct `mark-scan` is printing and interpreting ballots for.
   */
  setPrecinctSelection(precinctSelection?: PrecinctSelection): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set precinct selection without an election.');
    }

    this.client.run(
      'update election set precinct_selection = ?',
      precinctSelection ? JSON.stringify(precinctSelection) : null
    );
  }

  /**
   * Gets the current precinct `scan` is accepting ballots for.
   */
  getPrecinctSelection(): Optional<PrecinctSelection> {
    const electionRow = this.client.one(
      'select precinct_selection as rawPrecinctSelection from election'
    ) as { rawPrecinctSelection: string } | undefined;

    const rawPrecinctSelection = electionRow?.rawPrecinctSelection;

    if (!rawPrecinctSelection) {
      // precinct selection is undefined when there is no election
      return undefined;
    }

    const precinctSelectionParseResult = safeParseJson(
      rawPrecinctSelection,
      PrecinctSelectionSchema
    );

    if (precinctSelectionParseResult.isErr()) {
      throw new Error('Unable to parse stored precinct selection.');
    }

    return precinctSelectionParseResult.ok();
  }

  /**
   * Sets the current election definition and jurisdiction.
   */
  setElectionAndJurisdiction(input?: {
    electionData: string;
    jurisdiction: string;
  }): void {
    this.client.run('delete from election');
    if (input) {
      this.client.run(
        'insert into election (election_data, jurisdiction) values (?, ?)',
        input.electionData,
        input.jurisdiction
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

  getUiStringsStore(): UiStringsStore {
    return this.uiStringsStore;
  }
}
