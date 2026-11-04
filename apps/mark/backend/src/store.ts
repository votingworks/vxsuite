//
// The durable datastore for configuration info.
//

import util from 'node:util';
import {
  type BallotPositionsStore,
  type CandidateOrderingsStore,
  type ElectionRecord,
  ElectionPackageStore,
  type UiStringsStore,
  addDiagnosticRecord,
  getMostRecentDiagnosticRecord,
  type ElectionPackageInclude,
} from '@votingworks/backend';
import { assert, type Optional } from '@votingworks/basics';
import { Client as DbClient } from '@votingworks/db';
import type { BaseLogger } from '@votingworks/logging';
import {
  type SystemSettings,
  type PollsState,
  safeParse,
  PollsStateSchema,
  type ElectionKey,
  type BallotStyleId,
  type PrecinctId,
  type EncodedBallotEntry,
  type DiagnosticRecord,
  type DiagnosticType,
} from '@votingworks/types';
import { join } from 'node:path';
import type { PrintCalibration } from '@votingworks/hmpb';
import { DateTime } from 'luxon';
import {
  type BarcodeActivationMode,
  BarcodeActivationModeSchema,
  DEFAULT_BARCODE_ACTIVATION_MODE,
} from './barcodes/activation_mode.js';

const SchemaPath = join(import.meta.dirname, '../schema.sql');

/** The parts of an election package this app imports. */
export const ELECTION_PACKAGE_INCLUDE = {
  uiStrings: true,
  ballots: true,
  ballotPositions: true,
  candidateOrderings: true,
} as const satisfies ElectionPackageInclude;

export type ElectricalTestingComponent =
  | 'card'
  | 'usbDrive'
  | 'printer'
  | 'barcodeScanner';

/**
 * Manages a data store for imported election definition and system settings
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
  withTransaction<T>(fn: () => T): T {
    return this.client.transaction(() => fn());
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

  getCandidateOrderingsStore(): CandidateOrderingsStore {
    return this.electionPackageStore.getCandidateOrderingsStore();
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
    return this.electionPackageStore.getElectionRecord();
  }

  /**
   * Retrieves the election key (used for auth) for the current election.
   */
  getElectionKey(): ElectionKey | undefined {
    return this.electionPackageStore.getElectionKey();
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

  getUiStringsStore(): UiStringsStore {
    return this.electionPackageStore.getUiStringsStore();
  }

  /**
   * ID of the currently selected polling place.
   */
  getPollingPlaceId(): Optional<string> {
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
    // @coverage-exclude
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

    // @coverage-exclude
    if (pollsStateParseResult.isErr()) {
      throw new Error('Unable to parse stored polls state.');
    }

    return pollsStateParseResult.ok();
  }

  /**
   * Sets the current polls state
   */
  setPollsState(pollsState: PollsState): void {
    // @coverage-exclude
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
    // @coverage-exclude
    if (!this.hasElection()) {
      throw new Error('Cannot set ballots printed count without an election.');
    }

    this.client.run(
      'update election set ballots_printed_count = ?',
      ballotsPrintedCount
    );
  }

  /**
   * Gets the stored barcode ballot activation mode.
   */
  getBarcodeActivationMode(): BarcodeActivationMode {
    const electionRow = this.client.one(
      'select barcode_activation_mode as rawBarcodeActivationMode from election'
    ) as { rawBarcodeActivationMode: string } | undefined;

    if (!electionRow) {
      return DEFAULT_BARCODE_ACTIVATION_MODE;
    }

    return safeParse(
      BarcodeActivationModeSchema,
      electionRow.rawBarcodeActivationMode
    ).unsafeUnwrap();
  }

  /**
   * Sets the barcode ballot activation mode.
   */
  setBarcodeActivationMode(mode: BarcodeActivationMode): void {
    assert(
      this.hasElection(),
      'Cannot set barcode activation mode without an election.'
    );
    this.client.run('update election set barcode_activation_mode = ?', mode);
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

  /**
   * Retrieves a ballot PDF for the given ballot style and precinct.
   * Filters for precinct ballots with the appropriate mode based on isLiveMode.
   */
  getBallot({
    ballotStyleId,
    precinctId,
    isLiveMode,
  }: {
    ballotStyleId: BallotStyleId;
    precinctId: PrecinctId;
    isLiveMode: boolean;
  }): EncodedBallotEntry | undefined {
    return this.electionPackageStore.getEncodedBallotStore().getBallot({
      ballotStyleId,
      precinctId,
      ballotType: 'precinct',
      ballotMode: isLiveMode ? 'official' : 'test',
    });
  }

  /**
   * Whether any test ballot PDFs are present in the election package.
   */
  hasTestBallots(): boolean {
    return this.electionPackageStore
      .getEncodedBallotStore()
      .hasBallots({ ballotMode: 'test' });
  }

  /**
   * Adds a diagnostic record to the store.
   */
  addDiagnosticRecord(record: Omit<DiagnosticRecord, 'timestamp'>): void {
    addDiagnosticRecord(this.client, record);
  }

  /**
   * Gets the most recent diagnostic record of a given type.
   */
  getMostRecentDiagnosticRecord(
    type: DiagnosticType
  ): DiagnosticRecord | undefined {
    return getMostRecentDiagnosticRecord(this.client, type);
  }

  getElectricalTestingStatusMessages(): Array<{
    component: ElectricalTestingComponent;
    statusMessage: string;
    updatedAt: DateTime;
  }> {
    return (
      this.client.all(
        `
      select
        component,
        status_message as statusMessage,
        updated_at as updatedAt
      from electrical_testing_status_messages
      order by component asc
      `
      ) as Array<{
        component: ElectricalTestingComponent;
        statusMessage: string;
        updatedAt: string;
      }>
    ).map((record) => ({
      ...record,
      updatedAt: DateTime.fromSQL(record.updatedAt).toUTC(),
    }));
  }

  setElectricalTestingStatusMessage(
    component: ElectricalTestingComponent,
    statusMessage: string
  ): void {
    this.client.run(
      `
      insert or replace into electrical_testing_status_messages (
        component,
        status_message
      ) values (?, ?)
      `,
      component,
      statusMessage
    );
  }
}
