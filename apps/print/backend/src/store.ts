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
  EncodedBallotEntry,
  PrecinctSelection as PrecinctSelectionType,
  safeParseJson,
  PrecinctSelectionSchema,
  BallotType,
} from '@votingworks/types';
import { join } from 'node:path';
import { BallotPrintCount, BallotPrintEntry } from './types';
import { addBallotsPropsToPrintCountRow } from './util/ballot_styles';
import { sortBallotPrintCounts } from './util/sort';

export type BallotPrintCountRow = Omit<
  BallotPrintCount,
  'precinctOrSplitName' | 'partyName' | 'languageCode'
> & { precinctId: string };

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

  deleteElectionRecord(): void {
    this.client.run('delete from election');
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
   * Get the PrecinctSelection for VxPrint, either
   * AllPrecincts, SinglePrecinct, or undefined. If `undefined`,
   * configuration has not been done.
   *
   * Configuration is done by the Election Manager and applies to Poll Workers.
   */
  getPrecinctSelection(): PrecinctSelectionType | undefined {
    const electionRow = this.client.one(
      'select precinct_selection as rawPrecinctSelection from election'
    ) as { rawPrecinctSelection: string } | undefined;

    const rawPrecinctSelection = electionRow?.rawPrecinctSelection;
    if (!rawPrecinctSelection) {
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
   * Sets the current precinct `print` is configured to print ballots for
   */
  setPrecinctSelection(precinctSelection?: PrecinctSelectionType): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set precinct selection without an election.');
    }

    this.client.run(
      'update election set precinct_selection = ?',
      precinctSelection ? JSON.stringify(precinctSelection) : null
    );
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

  /**
   * Stores encoded ballots for printing.
   */
  setBallots(ballots: EncodedBallotEntry[]): void {
    this.client.run('delete from ballots');

    const insert = this.client.prepare(
      `
      insert into ballots (
        ballot_style_id,
        precinct_id,
        ballot_type,
        ballot_mode,
        encoded_ballot
      ) values (?, ?, ?, ?, ?)
      `
    );

    for (const ballot of ballots) {
      this.client.run(
        insert,
        ballot.ballotStyleId,
        ballot.precinctId,
        ballot.ballotType,
        ballot.ballotMode,
        ballot.encodedBallot
      );
    }
  }

  /**
   * Deletes all stored ballots.
   */
  deleteBallots(): void {
    this.client.run('delete from ballots');
  }

  getBallotPrintCounts({
    precinctId,
  }: {
    precinctId?: string;
  }): BallotPrintCount[] {
    const rows = this.client.all(
      `
      select
        ballot_style_id as ballotStyleId,
        precinct_id as precinctId,
        sum(case when ballot_type = 'absentee' then print_count else 0 end) as absenteeCount,
        sum(case when ballot_type = 'precinct' then print_count else 0 end) as precinctCount,
        sum(print_count) as totalCount
      from ballots
      ${precinctId ? 'where precinct_id = ?' : ''}
      group by ballot_style_id, precinct_id
      order by totalCount desc, precinct_id asc
      `,
      ...(precinctId ? [precinctId] : [])
    ) as BallotPrintCountRow[];
    const { election } = assertDefined(
      this.getElectionRecord()
    ).electionDefinition;

    return rows
      .map((row) => addBallotsPropsToPrintCountRow(election, row))
      .sort(sortBallotPrintCounts);
  }

  /**
   * Retrieves all stored encoded ballots.
   */
  getBallots(): BallotPrintEntry[] {
    return this.client.all(
      `
      select
        id as ballotPrintId,
        ballot_style_id as ballotStyleId,
        precinct_id as precinctId,
        ballot_type as ballotType,
        ballot_mode as ballotMode,
        encoded_ballot as encodedBallot
      from ballots
      `
    ) as BallotPrintEntry[];
  }

  getBallot({
    ballotStyleId,
    precinctId,
    ballotType,
  }: {
    ballotStyleId: string;
    precinctId: string;
    ballotType: BallotType;
  }): BallotPrintEntry | null {
    return (this.client.one(
      `
      select
        ballot_style_id as ballotStyleId,
        precinct_id as precinctId,
        ballot_type as ballotType,
        ballot_mode as ballotMode,
        encoded_ballot as encodedBallot
      from ballots
      where 
        ballot_style_id = ? and 
        precinct_id = ? and 
        ballot_type = ? and 
        ballot_mode = 'official'
      `,
      ballotStyleId,
      precinctId,
      ballotType
    ) || null) as BallotPrintEntry | null;
  }

  /**
   * Increments the print count for ballots matching the specified criteria.
   */
  incrementBallotPrintCount({
    precinctId,
    ballotStyleId,
    ballotType,
    count,
  }: {
    precinctId: string;
    ballotStyleId: string;
    ballotType: BallotType;
    count: number;
  }): void {
    this.client.run(
      `
      update ballots
      set print_count = print_count + ?
      where
        precinct_id = ? and
        ballot_style_id = ? and
        ballot_type = ? and
        ballot_mode = 'official'
      `,
      count,
      precinctId,
      ballotStyleId,
      ballotType
    );
  }
}
