//
// The durable datastore for configuration info.
//

import { Buffer } from 'node:buffer';
import util from 'node:util';
import { UiStringsStore, createUiStringStore } from '@votingworks/backend';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  Optional,
} from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import { BaseLogger } from '@votingworks/logging';
import {
  ElectionDefinition,
  safeParseElectionDefinition,
  SystemSettings,
  safeParseSystemSettings,
  PrecinctSelection,
  PrecinctSelectionSchema,
  safeParseJson,
  PollsState,
  safeParse,
  PollsStateSchema,
  ElectionKey,
  constructElectionKey,
  BallotStyleId,
} from '@votingworks/types';
import { join } from 'node:path';
import { PrintCalibration } from '@votingworks/hmpb';
import { PrintMode } from './types';

const SchemaPath = join(__dirname, '../schema.sql');

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

  getBallotPdf(ballotStyleId: BallotStyleId): Uint8Array {
    const result = this.client.one(
      'select data from ballot_pdfs where ballot_style_id = ?',
      ballotStyleId
    ) as { data: Buffer } | null;
    assert(result, `No ballot PDF found for ballot style ID: ${ballotStyleId}`);
    return Uint8Array.from(result.data);
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

  setBallotPdfs(ballotPdfs: Map<BallotStyleId, Buffer>): void {
    this.client.run('delete from ballot_pdfs');
    for (const [ballotStyleId, data] of ballotPdfs) {
      this.client.run(
        `
        insert into ballot_pdfs (ballot_style_id, data) values (?, ?)
        `,
        ballotStyleId,
        data
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

  /**
   * Gets the current precinct for which voters can cast ballots. If set to
   * `undefined`, ballots from all precincts will be accepted (this is the
   * default).
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

    /* istanbul ignore next - @preserve */
    if (precinctSelectionParseResult.isErr()) {
      throw new Error('Unable to parse stored precinct selection.');
    }

    return precinctSelectionParseResult.ok();
  }

  /**
   * Sets the current precinct for which voters can cast ballots. Set to
   * `undefined` to accept from all precincts (this is the default).
   */
  setPrecinctSelection(precinctSelection: PrecinctSelection): void {
    /* istanbul ignore next - @preserve */
    if (!this.hasElection()) {
      throw new Error('Cannot set precinct selection without an election.');
    }

    this.client.run(
      'update election set precinct_selection = ?',
      JSON.stringify(precinctSelection)
    );
  }

  getPrintMode(): PrintMode {
    if (!this.hasElection()) return 'summary';

    const res = this.client.one('select print_mode as mode from election') as
      | { mode: PrintMode }
      | undefined;

    return assertDefined(res?.mode);
  }

  setPrintMode(mode: PrintMode): void {
    assert(this.hasElection(), 'Cannot set print mode without an election');
    assert(
      mode === 'bubble_marks' || mode === 'summary',
      `invalid print mode: ${mode}`
    );

    this.client.run('update election set print_mode = ?', mode);
  }

  /**
   * Gets the current test mode setting value.
   */
  getTestMode(): boolean {
    const electionRow = this.client.one(
      'select is_test_mode as isTestMode from election'
    ) as { isTestMode: number } | undefined;

    if (!electionRow) {
      // test mode will be the default once an election is defined
      return true;
    }

    return Boolean(electionRow.isTestMode);
  }

  /**
   * Sets the current test mode setting value.
   */
  setTestMode(isTestMode: boolean): void {
    /* istanbul ignore next - @preserve */
    if (!this.hasElection()) {
      throw new Error('Cannot set test mode without an election.');
    }

    this.client.run('update election set is_test_mode = ?', isTestMode ? 1 : 0);
  }

  /**
   * Gets the current polls state (open, paused, closed initial, or closed final)
   */
  getPollsState(): PollsState {
    const electionRow = this.client.one(
      'select polls_state as rawPollsState from election'
    ) as { rawPollsState: string } | undefined;

    if (!electionRow) {
      // polls_closed_initial will be the default once an election is defined
      return 'polls_closed_initial';
    }

    const pollsStateParseResult = safeParse(
      PollsStateSchema,
      electionRow.rawPollsState
    );

    /* istanbul ignore next - @preserve */
    if (pollsStateParseResult.isErr()) {
      throw new Error('Unable to parse stored polls state.');
    }

    return pollsStateParseResult.ok();
  }

  /**
   * Sets the current polls state
   */
  setPollsState(pollsState: PollsState): void {
    /* istanbul ignore next - @preserve */
    if (!this.hasElection()) {
      throw new Error('Cannot set polls state without an election.');
    }

    this.client.run('update election set polls_state = ?', pollsState);
  }

  /**
   * Gets the current ballots printed count
   */
  getBallotsPrintedCount(): number {
    const electionRow = this.client.one(
      'select ballots_printed_count as ballotsPrintedCount from election'
    ) as { ballotsPrintedCount: number } | undefined;

    if (!electionRow) {
      // 0 will be the default once an election is defined
      return 0;
    }

    return electionRow.ballotsPrintedCount;
  }

  /**
   * Sets the current ballots printed count
   */
  setBallotsPrintedCount(ballotsPrintedCount: number): void {
    /* istanbul ignore next - @preserve */
    if (!this.hasElection()) {
      throw new Error('Cannot set ballots printed count without an election.');
    }

    this.client.run(
      'update election set ballots_printed_count = ?',
      ballotsPrintedCount
    );
  }

  getPrintCalibration(): PrintCalibration {
    const existing = this.client.one(`
      select
        offset_mm_x as offsetMmX,
        offset_mm_y as offsetMmY
      from print_calibration
    `) as PrintCalibration | undefined;

    return existing || { offsetMmX: 0, offsetMmY: 0 };
  }

  setPrintCalibration(c: PrintCalibration): void {
    assert(
      typeof c.offsetMmX === 'number' && typeof c.offsetMmY === 'number',
      `invalid print calibration - ${util.inspect(c)}`
    );

    this.client.run(
      `
        insert or replace into print_calibration (
          id,
          offset_mm_x,
          offset_mm_y
        ) values (1, ?, ?)
      `,
      c.offsetMmX,
      c.offsetMmY
    );
  }
}
