//
// The durable datastore for configuration info.
//

import {
  addDiagnosticRecord,
  type BallotPositionsStore,
  type ElectionRecord,
  ElectionPackageStore,
  getMostRecentDiagnosticRecord,
  type ElectionPackageInclude,
} from '@votingworks/backend';
import { assert, assertDefined, type NotPromise } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import type { BaseLogger } from '@votingworks/logging';
import type {
  SystemSettings,
  ElectionKey,
  EncodedBallotEntry,
  BallotType,
  BallotPrintCount,
  LanguageCode,
  DiagnosticRecord,
  DiagnosticType,
} from '@votingworks/types';
import { join } from 'node:path';
import type { BallotPrintEntry, BallotMode } from './types.js';
import {
  addBallotsPropsToPrintCountRow,
  getLanguageForBallotStyle,
} from './util/ballot_styles.js';
import { sortBallotPrintCounts } from './util/sort.js';

export type BallotPrintCountRow = Omit<
  BallotPrintCount,
  'precinctOrSplitName' | 'partyName' | 'languageCode'
> & { precinctId: string };

const SchemaPath = join(import.meta.dirname, '../schema.sql');

/** The parts of an election package this app imports. */
export const ELECTION_PACKAGE_INCLUDE = {
  uiStrings: false,
  ballots: true,
  ballotPositions: true,
  candidateOrderings: false,
} as const satisfies ElectionPackageInclude;

export interface IncrementBallotPrintCountParams {
  precinctId: string;
  ballotStyleId: string;
  ballotType: BallotType;
  ballotMode: BallotMode;
  count: number;
}

/**
 * Manages the election session, backed by the imported election package.
 */
export class Store {
  private readonly client: DbClient;
  private readonly electionPackageStore: ElectionPackageStore<
    typeof ELECTION_PACKAGE_INCLUDE
  >;

  private constructor(
    client: DbClient,
    electionPackageStore: ElectionPackageStore<typeof ELECTION_PACKAGE_INCLUDE>
  ) {
    this.client = client;
    this.electionPackageStore = electionPackageStore;
  }

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static memoryStore(): Store {
    return new Store(
      DbClient.memoryClient(SchemaPath),
      ElectionPackageStore.memoryStore(ELECTION_PACKAGE_INCLUDE)
    );
  }

  /**
   * Builds and returns a new store whose session is at `sessionDbPath` and
   * whose election package is at `electionPackageDbPath`.
   */
  static fileStore(
    sessionDbPath: string,
    electionPackageDbPath: string,
    logger: BaseLogger
  ): Store {
    return new Store(
      DbClient.fileClient(sessionDbPath, logger, SchemaPath),
      ElectionPackageStore.fileStore(
        electionPackageDbPath,
        ELECTION_PACKAGE_INCLUDE,
        logger
      )
    );
  }

  /**
   * Runs the given function in a transaction. If the function throws an error,
   * the transaction is rolled back. Otherwise, the transaction is committed.
   *
   * Returns the result of the function.
   */
  withTransaction<T>(fn: () => NotPromise<T>): T {
    return this.client.transaction(fn);
  }

  /**
   * Resets both databases.
   */
  reset(): void {
    this.client.reset();
    this.electionPackageStore.reset();
  }

  close(): void {
    this.client.close();
    this.electionPackageStore.close();
  }

  getElectionPackageStore(): ElectionPackageStore<
    typeof ELECTION_PACKAGE_INCLUDE
  > {
    return this.electionPackageStore;
  }

  getBallotPositionsStore(): BallotPositionsStore {
    return this.electionPackageStore.getBallotPositionsStore();
  }

  /**
   * Gets whether an election is currently configured.
   */
  hasElection(): boolean {
    return Boolean(this.client.one('select id from election'));
  }

  /**
   * Starts the session for the imported election package, which is what makes
   * the machine configured, so it comes after the package is imported.
   */
  startElectionSession(): void {
    this.client.run('delete from election');
    this.client.run('insert into election (id) values (1)');
  }

  /**
   * Gets the current election definition and election package hash.
   */
  getElectionRecord(): ElectionRecord | undefined {
    return this.hasElection()
      ? this.electionPackageStore.getElectionRecord()
      : undefined;
  }

  /**
   * Retrieves the election key (used for auth) for the current election.
   */
  getElectionKey(): ElectionKey | undefined {
    return this.hasElection()
      ? this.electionPackageStore.getElectionKey()
      : undefined;
  }

  /**
   * ID of the currently selected polling place.
   */
  getPollingPlaceId(): string | undefined {
    const row = this.client.one('select polling_place_id from election') as
      | { polling_place_id: string | null }
      | undefined;

    return row?.polling_place_id || undefined;
  }

  /**
   * Sets the current polling place for which voters can cast ballots.
   */
  setPollingPlaceId(id: string): void {
    assert(this.hasElection(), 'Cannot set polling place without an election.');
    this.client.run('update election set polling_place_id = ?', id);
  }

  /**
   * Gets the current jurisdiction.
   */
  getJurisdiction(): string | undefined {
    return this.electionPackageStore.getJurisdiction();
  }

  /**
   * Retrieves the system settings.
   */
  getSystemSettings(): SystemSettings | undefined {
    return this.electionPackageStore.getSystemSettings();
  }

  getBallotPrintCounts({
    ballotMode,
  }: {
    ballotMode: BallotMode;
  }): BallotPrintCount[] {
    const printCounts = this.client.all(
      `
      select
        ballot_style_id as ballotStyleId,
        precinct_id as precinctId,
        ballot_type as ballotType,
        count
      from ballot_print_counts
      where ballot_mode = ?
      `,
      ballotMode
    ) as Array<{
      ballotStyleId: string;
      precinctId: string;
      ballotType: BallotType;
      count: number;
    }>;
    const rowsByKey = new Map<string, BallotPrintCountRow>();
    for (const { ballotStyleId, precinctId } of this.electionPackageStore
      .getEncodedBallotStore()
      .getBallotKeys({ ballotMode })) {
      rowsByKey.set(JSON.stringify([ballotStyleId, precinctId]), {
        ballotStyleId,
        precinctId,
        absenteeCount: 0,
        precinctCount: 0,
        totalCount: 0,
      });
    }
    for (const {
      ballotStyleId,
      precinctId,
      ballotType,
      count,
    } of printCounts) {
      const row = rowsByKey.get(JSON.stringify([ballotStyleId, precinctId]));
      if (!row) continue;
      if (ballotType === 'absentee') row.absenteeCount += count;
      if (ballotType === 'precinct') row.precinctCount += count;
      row.totalCount += count;
    }
    const { election } = assertDefined(
      this.getElectionRecord()
    ).electionDefinition;

    return [...rowsByKey.values()]
      .map((row) => addBallotsPropsToPrintCountRow(election, row))
      .sort(sortBallotPrintCounts);
  }

  getTotalBallotPrintCount(): number {
    const result = this.client.one(
      'select coalesce(sum(count), 0) as total from ballot_print_counts'
    ) as { total: number };
    return result.total;
  }

  /**
   * Retrieves all stored encoded ballots.
   */
  getBallots(input: {
    ballotMode: BallotMode;
    ballotType?: BallotType;
    languageCode?: LanguageCode;
  }): BallotPrintEntry[] {
    const rows: BallotPrintEntry[] = this.electionPackageStore
      .getEncodedBallotStore()
      .getBallots({
        ballotMode: input.ballotMode,
        ballotType: input.ballotType,
      })
      .map(({ id, ...ballot }) => ({ ...ballot, ballotPrintId: id }));

    if (input.languageCode) {
      const electionRecord = assertDefined(this.getElectionRecord());
      const { election } = electionRecord.electionDefinition;
      return rows.filter((row) => {
        const ballotStyle = election.ballotStyles.find(
          (bs) => bs.id === row.ballotStyleId
        );
        return assertDefined(ballotStyle).languages.includes(
          assertDefined(input.languageCode)
        );
      });
    }

    return rows;
  }

  getBallot(key: {
    ballotStyleId: string;
    precinctId: string;
    ballotType: BallotType;
    ballotMode: BallotMode;
  }): EncodedBallotEntry | undefined {
    return this.electionPackageStore.getEncodedBallotStore().getBallot(key);
  }

  /**
   * Whether any test ballot PDFs are present in the election package.
   */
  hasTestBallots(): boolean {
    return this.electionPackageStore
      .getEncodedBallotStore()
      .hasBallots({ ballotMode: 'test' });
  }

  getDistinctBallotStylesCount({
    ballotMode,
    ballotType,
    languageCode,
  }: {
    ballotMode: BallotMode;
    ballotType: BallotType;
    languageCode: LanguageCode;
  }): number {
    const electionRecord = this.getElectionRecord();
    if (!electionRecord) {
      return 0;
    }

    const { election } = electionRecord.electionDefinition;
    return this.electionPackageStore
      .getEncodedBallotStore()
      .getBallotKeys({ ballotType, ballotMode })
      .filter(
        (row) =>
          getLanguageForBallotStyle({
            election,
            ballotStyleId: row.ballotStyleId,
          }) === languageCode
      ).length;
  }

  /**
   * Increments the print count for ballots matching the specified criteria.
   */
  incrementBallotPrintCount({
    precinctId,
    ballotStyleId,
    ballotType,
    ballotMode,
    count,
  }: IncrementBallotPrintCountParams): void {
    this.client.run(
      `
      insert into ballot_print_counts (
        ballot_style_id,
        precinct_id,
        ballot_type,
        ballot_mode,
        count
      ) values (?, ?, ?, ?, ?)
      on conflict (ballot_style_id, precinct_id, ballot_type, ballot_mode)
      do update set count = count + excluded.count
      `,
      ballotStyleId,
      precinctId,
      ballotType,
      ballotMode,
      count
    );
  }

  /**
   * Gets the current test mode setting value.
   */
  getTestMode(): boolean {
    const electionRow = this.client.one(
      'select is_test_mode as isTestMode from election'
    ) as { isTestMode: number } | undefined;

    if (!electionRow) {
      // official mode will be the default once an election is defined
      return false;
    }

    return Boolean(electionRow.isTestMode);
  }

  /**
   * Sets the current test mode setting value.
   */
  setTestMode(testMode: boolean): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set test mode without an election.');
    }

    this.client.run('update election set is_test_mode = ?', testMode ? 1 : 0);
  }

  /**
   * Resets all ballot print counts to zero.
   */
  resetBallotPrintCounts(): void {
    this.client.run('delete from ballot_print_counts');
  }

  addDiagnosticRecord(record: Omit<DiagnosticRecord, 'timestamp'>): void {
    addDiagnosticRecord(this.client, record);
  }

  getMostRecentDiagnosticRecord(
    type: DiagnosticType
  ): DiagnosticRecord | undefined {
    return getMostRecentDiagnosticRecord(this.client, type);
  }
}
