//
// The durable datastore for CVRs and configuration info.
//

import { Client as DbClient } from '@votingworks/db';
import {
  AdjudicationStatus,
  BallotPaperSize,
  BallotSheetInfo,
  BatchInfo,
  Iso8601Timestamp,
  mapSheet,
  MarkThresholds,
  PageInterpretationSchema,
  PageInterpretationWithFiles,
  PollsState as PollsStateType,
  PollsStateSchema,
  PrecinctSelection as PrecinctSelectionType,
  PrecinctSelectionSchema,
  safeParse,
  safeParseElectionDefinition,
  safeParseJson,
  SheetOf,
  Side,
  SystemSettings,
  safeParseSystemSettings,
  AdjudicationReason,
  DiagnosticRecord,
  DiagnosticType,
  ElectionId,
  ElectionKey,
  constructElectionKey,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  DateWithoutTime,
  find,
  Optional,
} from '@votingworks/basics';
import makeDebug from 'debug';
import { DateTime } from 'luxon';
import { dirname, join } from 'path';
import { v4 as uuid } from 'uuid';
import {
  AcceptedSheet,
  ElectionRecord,
  RejectedSheet,
  Sheet,
  addDiagnosticRecord,
  getMaximumUsableDiskSpace,
  getMostRecentDiagnosticRecord,
  updateMaximumUsableDiskSpace,
} from '@votingworks/backend';
import {
  clearCastVoteRecordHashes,
  getCastVoteRecordRootHash,
  updateCastVoteRecordHashes,
} from '@votingworks/auth';
import { BaseLogger } from '@votingworks/logging';
import { sheetRequiresAdjudication } from './sheet_requires_adjudication';
import { normalizeAndJoin } from './util/path';

const debug = makeDebug('scan:store');

const SchemaPath = join(__dirname, '../schema.sql');

const getSheetsBaseQuery = `
  select
    sheets.id as id,
    batches.id as batchId,
    sheets.ballot_audit_id as ballotAuditId,
    front_interpretation_json as frontInterpretationJson,
    back_interpretation_json as backInterpretationJson,
    front_image_path as frontImagePath,
    back_image_path as backImagePath,
    requires_adjudication as requiresAdjudication,
    finished_adjudication_at as finishedAdjudicationAt,
    sheets.deleted_at as deletedAt,
    row_number() over (partition by batches.id order by sheets.created_at) indexInBatch
  from sheets left join batches on
    sheets.batch_id = batches.id
`;

interface SheetRow {
  id: string;
  batchId: string;
  ballotAuditId: string;
  frontInterpretationJson: string;
  backInterpretationJson: string;
  frontImagePath: string;
  backImagePath: string;
  requiresAdjudication: 0 | 1;
  finishedAdjudicationAt: Iso8601Timestamp | null;
  deletedAt: Iso8601Timestamp | null;
  indexInBatch: number;
}

function sheetRowToAcceptedSheet(row: SheetRow): AcceptedSheet {
  assert(row.deletedAt === null);
  return {
    type: 'accepted',
    id: row.id,
    batchId: row.batchId,
    ballotAuditId: row.ballotAuditId || undefined,
    interpretation: mapSheet(
      [row.frontInterpretationJson, row.backInterpretationJson],
      (json) => safeParseJson(json, PageInterpretationSchema).unsafeUnwrap()
    ),
    frontImagePath: row.frontImagePath,
    backImagePath: row.backImagePath,
    indexInBatch: row.indexInBatch,
  };
}

function sheetRowToRejectedSheet(row: SheetRow): RejectedSheet {
  assert(row.deletedAt !== null);
  return {
    type: 'rejected',
    id: row.id,
    frontImagePath: row.frontImagePath,
    backImagePath: row.backImagePath,
    ballotAuditId: row.ballotAuditId,
  };
}

function sheetRowToSheet(row: SheetRow): Sheet {
  // The central scanner UX guarantees this condition. Sheets requiring review have to be accepted
  // or rejected before a batch is considered complete. And if someone shuts the machine down
  // mid-adjudication, on boot, incomplete batches are cleaned up.
  assert(
    row.requiresAdjudication === 0 ||
      row.finishedAdjudicationAt !== null ||
      row.deletedAt !== null,
    'Every sheet requiring review should have been either accepted or rejected'
  );
  return row.deletedAt === null
    ? sheetRowToAcceptedSheet(row)
    : sheetRowToRejectedSheet(row);
}

function dateTimeFromNoOffsetSqliteDate(noOffsetSqliteDate: string): DateTime {
  return DateTime.fromFormat(noOffsetSqliteDate, 'yyyy-MM-dd HH:mm:ss', {
    zone: 'GMT',
  });
}

/**
 * Manages a data store for imported ballot image batches and cast vote records
 * interpreted by reading the sheets.
 */
export class Store {
  private constructor(private readonly client: DbClient) {}

  // Used by shared CVR export logic in libs/backend
  // eslint-disable-next-line vx/gts-no-public-class-fields
  readonly scannerType = 'central';

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
  static fileStore(dbPath: string, logger: BaseLogger): Store {
    return new Store(DbClient.fileClient(dbPath, logger, SchemaPath));
  }

  /**
   * Writes a copy of the database to the given path.
   */
  backup(filepath: string): void {
    this.client.run('vacuum into ?', filepath);
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
      id: result.id as ElectionId,
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
   * Gets system settings or undefined if they aren't loaded yet
   */
  getSystemSettings(): SystemSettings | undefined {
    const result = this.client.one(`select data from system_settings`) as
      | { data: string }
      | undefined;

    if (!result) return undefined;
    return safeParseSystemSettings(result.data).unsafeUnwrap();
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
  setTestMode(testMode: boolean): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set test mode without an election.');
    }

    this.client.run('update election set is_test_mode = ?', testMode ? 1 : 0);
  }

  /**
   * Gets whether sound is muted.
   */
  getIsSoundMuted(): boolean {
    const electionRow = this.client.one(
      'select is_sound_muted as isSoundMuted from election'
    ) as { isSoundMuted: number } | undefined;

    if (!electionRow) {
      // we will not mute sounds by default once an election is defined
      return false;
    }

    return Boolean(electionRow.isSoundMuted);
  }

  /**
   * Sets whether sound is muted.
   */
  setIsSoundMuted(isSoundMuted: boolean): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set sounds to muted without an election.');
    }

    this.client.run(
      'update election set is_sound_muted = ?',
      isSoundMuted ? 1 : 0
    );
  }

  /**
   * Gets the number of ballots at which the ballot bag was last replaced.
   */
  getBallotCountWhenBallotBagLastReplaced(): number {
    const electionRow = this.client.one(
      'select ballot_count_when_ballot_bag_last_replaced as ballotCountWhenBallotBagLastReplaced from election'
    ) as { ballotCountWhenBallotBagLastReplaced: number } | undefined;

    if (!electionRow) {
      // the default will be 0 once the election is defined
      return 0;
    }

    return electionRow.ballotCountWhenBallotBagLastReplaced;
  }

  /**
   * Sets the number of ballots at which the ballot bag was last replaced.
   */
  setBallotCountWhenBallotBagLastReplaced(
    ballotCountWhenBallotBagLastReplaced: number
  ): void {
    if (!this.hasElection()) {
      throw new Error(
        'Cannot set ballot count when ballot bag last replaced without an election.'
      );
    }

    this.client.run(
      'update election set ballot_count_when_ballot_bag_last_replaced = ?',
      ballotCountWhenBallotBagLastReplaced
    );
  }

  getBallotPaperSizeForElection(): BallotPaperSize {
    const electionRecord = this.getElectionRecord();
    return (
      electionRecord?.electionDefinition.election.ballotLayout.paperSize ??
      BallotPaperSize.Letter
    );
  }

  getMarkThresholds(): MarkThresholds {
    return assertDefined(this.getSystemSettings()).markThresholds;
  }

  getAdjudicationReasons(): readonly AdjudicationReason[] {
    return assertDefined(this.getSystemSettings())
      .centralScanAdjudicationReasons;
  }

  /**
   * Gets the current precinct `scan` is accepting ballots for. If set to
   * `undefined`, ballots from all precincts will be accepted (this is the
   * default).
   */
  getPrecinctSelection(): Optional<PrecinctSelectionType> {
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
   * Sets the current precinct `scan` is accepting ballots for. Set to
   * `undefined` to accept from all precincts (this is the default).
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
   * Gets the current polls state (open, paused, closed initial, or closed final)
   */
  getPollsState(): PollsStateType {
    const electionRow = this.client.one(
      'select polls_state as rawPollsState from election'
    ) as { rawPollsState: string } | undefined;

    if (!electionRow) {
      // we will not skip the check by default once an election is defined
      return 'polls_closed_initial';
    }

    const pollsStateParseResult = safeParse(
      PollsStateSchema,
      electionRow.rawPollsState
    );

    if (pollsStateParseResult.isErr()) {
      throw new Error('Unable to parse stored polls state.');
    }

    return pollsStateParseResult.ok();
  }

  /**
   * Sets the current polls state
   */
  setPollsState(pollsState: PollsStateType): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set polls state without an election.');
    }

    this.client.run('update election set polls_state = ?', pollsState);
  }

  /**
   * Adds a batch and returns its id.
   */
  addBatch(): string {
    const id = uuid();
    this.client.run('insert into batches (id) values (?)', id);
    this.client.run(
      `update batches set label = 'Batch ' || batch_number WHERE id = ?`,
      id
    );
    return id;
  }

  /**
   * Marks the batch with id `batchId` as finished.
   */
  finishBatch({ batchId, error }: { batchId: string; error?: string }): void {
    this.client.run(
      'update batches set ended_at = current_timestamp, error = ? where id = ?',
      error ?? null,
      batchId
    );
  }

  /**
   * Returns the id of the an unfinished batch if there is one
   */
  getOngoingBatchId(): Optional<string> {
    const ongoingBatchRow = this.client.one(
      'select id from batches where ended_at is null'
    ) as { id: string } | undefined;

    return ongoingBatchRow?.id;
  }

  /**
   * Records that batches have been backed up.
   */
  setScannerBackedUp(backedUp = true): void {
    if (!this.hasElection()) {
      throw new Error('Unconfigured scanner cannot be backed up.');
    }

    if (backedUp) {
      this.client.run(
        'update election set scanner_backed_up_at = current_timestamp'
      );
    } else {
      this.client.run('update election set scanner_backed_up_at = null');
    }
  }

  /**
   * Gets the timestamp for the last scanner backup
   */
  getScannerBackupTimestamp(): DateTime | undefined {
    const row = this.client.one(
      'select scanner_backed_up_at as scannerBackedUpAt from election'
    ) as { scannerBackedUpAt: string } | undefined;
    if (!row?.scannerBackedUpAt) {
      return undefined;
    }

    return dateTimeFromNoOffsetSqliteDate(row.scannerBackedUpAt);
  }

  getBallotsCounted(): number {
    const row = this.client.one(`
      select
        count(sheets.id) as ballotsCounted
      from
        sheets inner join batches
      on
        sheets.batch_id = batches.id
      and
        sheets.deleted_at is null
      where
        batches.deleted_at is null
    `) as { ballotsCounted: number } | undefined;

    return row?.ballotsCounted ?? 0;
  }

  /**
   * Returns whether the appropriate backups have been completed and it is safe
   * to unconfigure a machine / reset the election session. Always returns
   * true in test mode.
   */
  getCanUnconfigure(): boolean {
    // Always allow in test mode
    if (this.getTestMode()) {
      return true;
    }

    // Allow if no ballots have been counted
    if (!this.getBallotsCounted()) {
      return true;
    }

    const scannerBackedUpAt = this.getScannerBackupTimestamp();

    // Require that a scanner backup has taken place
    if (!scannerBackedUpAt) {
      return false;
    }

    // Adding or deleting sheets would have updated the CVR count
    const { maxSheetsCreatedAt, maxSheetsDeletedAt } = this.client.one(`
        select
          max(created_at) as maxSheetsCreatedAt, 
          max(deleted_at) as maxSheetsDeletedAt
        from sheets
      `) as {
      maxSheetsCreatedAt: string;
      maxSheetsDeletedAt: string;
    };

    // Deleting non-empty batches would have updated the CVR count
    const { maxBatchesDeletedAt } = this.client.one(`
      select
        max(batches.deleted_at) as maxBatchesDeletedAt
      from batches inner join sheets
      on sheets.batch_id = batches.id
      where sheets.deleted_at is null
    `) as {
      maxBatchesDeletedAt: string;
    };

    const cvrsLastUpdatedDates = [
      maxBatchesDeletedAt,
      maxSheetsCreatedAt,
      maxSheetsDeletedAt,
    ]
      .filter(Boolean)
      .map((noOffsetSqliteDate) =>
        dateTimeFromNoOffsetSqliteDate(noOffsetSqliteDate)
      );

    return scannerBackedUpAt >= DateTime.max(...cvrsLastUpdatedDates);
  }

  addBallotCard(batchId: string): string {
    const id = uuid();
    this.client.run(
      'insert into ballot_cards (id, batch_id) values (?, ?)',
      id,
      batchId
    );
    return id;
  }

  /**
   * Adds a sheet to an existing batch.
   */
  addSheet(
    sheetId: string,
    batchId: string,
    [front, back]: SheetOf<PageInterpretationWithFiles>,
    ballotAuditId?: string
  ): string {
    try {
      const requiresAdjudication = sheetRequiresAdjudication([
        front.interpretation,
        back.interpretation,
      ]);

      this.client.run(
        `insert into sheets (
            id,
            batch_id,
            ballot_audit_id,
            front_image_path,
            front_interpretation_json,
            back_image_path,
            back_interpretation_json,
            requires_adjudication,
            finished_adjudication_at
          ) values (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
          )`,
        sheetId,
        batchId,
        ballotAuditId || null,
        front.imagePath,
        JSON.stringify(front.interpretation),
        back.imagePath,
        JSON.stringify(back.interpretation ?? {}),
        requiresAdjudication ? 1 : 0,
        requiresAdjudication ? null : DateTime.now().toISOTime()
      );
    } catch (error) {
      debug(
        'sheet insert failed; maybe a duplicate? filenames=[%s, %s]',
        front.imagePath,
        back.imagePath
      );

      const row = this.client.one(
        'select id from sheets where front_image_path = ?',
        front.imagePath
      ) as { id: string } | undefined;

      if (row) {
        return row.id;
      }

      throw error;
    }

    return sheetId;
  }

  /**
   * Mark a sheet as deleted
   */
  deleteSheet(sheetId: string): void {
    this.client.run(
      'update sheets set deleted_at = current_timestamp where id = ?',
      sheetId
    );
  }

  resetElectionSession(): void {
    if (this.hasElection()) {
      this.client.transaction(() => {
        this.setPollsState('polls_closed_initial');
        this.setBallotCountWhenBallotBagLastReplaced(0);

        // Delete batches, which will cascade delete sheets
        this.client.run('delete from batches');
        // Reset auto-incrementing key on "batches" table
        this.client.run("delete from sqlite_sequence where name = 'batches'");

        this.setScannerBackedUp(false);
      });
    }
  }

  getBallotImagePath(sheetId: string, side: Side): Optional<string> {
    const row = this.client.one(
      `
      select
        ${side}_image_path as imagePath
      from
        sheets
      where
        id = ?
    `,
      sheetId
    ) as Optional<{ imagePath: string }>;

    if (!row) {
      return;
    }

    return normalizeAndJoin(dirname(this.getDbPath()), row.imagePath);
  }

  getNextAdjudicationSheet(): BallotSheetInfo | undefined {
    const row = this.client.one(
      `
      select
        id,
        front_interpretation_json as frontInterpretationJson,
        back_interpretation_json as backInterpretationJson,
        finished_adjudication_at as finishedAdjudicationAt
      from sheets
      where
        requires_adjudication = 1 and
        finished_adjudication_at is null and
        deleted_at is null
      order by created_at asc
      limit 1
      `
    ) as
      | {
          id: string;
          frontInterpretationJson: string;
          backInterpretationJson: string;
          finishedAdjudicationAt: string | null;
        }
      | undefined;

    // TODO: these URLs and others in this file probably don't belong
    //       in this file, which shouldn't deal with the URL API.
    if (row) {
      debug('got next review sheet requiring adjudication (id=%s)', row.id);
      return {
        id: row.id,
        front: {
          image: {
            url: `/central-scanner/scan/hmpb/ballot/${row.id}/front/image`,
          },
          interpretation: JSON.parse(row.frontInterpretationJson),
          adjudicationFinishedAt: row.finishedAdjudicationAt ?? undefined,
        },
        back: {
          image: {
            url: `/central-scanner/scan/hmpb/ballot/${row.id}/back/image`,
          },
          interpretation: JSON.parse(row.backInterpretationJson),
          adjudicationFinishedAt: row.finishedAdjudicationAt ?? undefined,
        },
      };
    }
    debug('no review sheets requiring adjudication');
  }

  adjudicateSheet(sheetId: string): boolean {
    debug('finishing adjudication for sheet %s', sheetId);

    this.client.run(
      `
      update
        sheets
      set
        finished_adjudication_at = ?
      where id = ?
    `,
      new Date().toISOString(),
      sheetId
    );

    return true;
  }

  /**
   * Mark a batch as deleted
   */
  deleteBatch(batchId: string): boolean {
    const { count } = this.client.one(
      'select count(*) as count from batches where deleted_at is null and id = ?',
      batchId
    ) as { count: number };

    this.client.run(
      'update batches set deleted_at = current_timestamp where id = ?',
      batchId
    );
    return count > 0;
  }

  /**
   * Cleanup partial batches
   */
  cleanupIncompleteBatches(): void {
    // cascades to the sheets
    this.client.run('delete from batches where ended_at is null');
  }

  /**
   * Gets all batches, including their sheet count.
   */
  getBatches(): BatchInfo[] {
    interface SqliteBatchInfo {
      id: string;
      batchNumber: number;
      label: string;
      startedAt: string;
      endedAt: string | null;
      error: string | null;
      count: number;
    }
    const batchInfo = this.client.all(`
      select
        batches.id as id,
        batches.batch_number as batchNumber,
        batches.label as label,
        strftime('%s', started_at) as startedAt,
        (case when ended_at is null then ended_at else strftime('%s', ended_at) end) as endedAt,
        error,
        sum(case when sheets.id is null then 0 else 1 end) as count
      from
        batches left join sheets
      on
        sheets.batch_id = batches.id
      and
        sheets.deleted_at is null
      where
        batches.deleted_at is null
      group by
        batches.id,
        batches.started_at,
        batches.ended_at,
        error
      order by
        batches.started_at desc
    `) as SqliteBatchInfo[];
    return batchInfo.map((info) => ({
      id: info.id,
      batchNumber: info.batchNumber,
      label: info.label,
      // eslint-disable-next-line vx/gts-safe-number-parse
      startedAt: DateTime.fromSeconds(Number(info.startedAt)).toISO(),
      endedAt:
        // eslint-disable-next-line vx/gts-safe-number-parse
        (info.endedAt && DateTime.fromSeconds(Number(info.endedAt)).toISO()) ||
        undefined,
      error: info.error || undefined,
      count: info.count,
    }));
  }

  /**
   * Gets a batch by ID, expecting it to exist.
   */
  getBatch(batchId: string): BatchInfo {
    return find(this.getBatches(), (b) => b.id === batchId);
  }

  /**
   * Gets adjudication status.
   */
  adjudicationStatus(): AdjudicationStatus {
    const { remaining } = this.client.one(`
        select count(*) as remaining
        from sheets
        where
          requires_adjudication = 1
          and deleted_at is null
          and finished_adjudication_at is null
      `) as { remaining: number };
    const { adjudicated } = this.client.one(`
        select count(*) as adjudicated
        from sheets
        where
          requires_adjudication = 1
          and finished_adjudication_at is not null
      `) as { adjudicated: number };
    return { adjudicated, remaining };
  }

  /**
   * Yields all scanned sheets that were accepted and should be tabulated
   */
  *forEachAcceptedSheet(): Generator<AcceptedSheet> {
    const sql = `${getSheetsBaseQuery}
      where
        batches.deleted_at is null and
        sheets.deleted_at is null and
        (requires_adjudication = 0 or finished_adjudication_at is not null)
      order by sheets.created_at
    `;
    for (const row of this.client.each(sql) as Iterable<SheetRow>) {
      yield sheetRowToAcceptedSheet(row);
    }
  }

  /**
   * Yields all scanned sheets
   */
  *forEachSheet(): Generator<Sheet> {
    const sql = `${getSheetsBaseQuery}
      where
        batches.deleted_at is null
      order by sheets.created_at
    `;
    for (const row of this.client.each(sql) as Iterable<SheetRow>) {
      yield sheetRowToSheet(row);
    }
  }

  getCastVoteRecordRootHash(): string {
    return getCastVoteRecordRootHash(this.client);
  }

  updateCastVoteRecordHashes(cvrId: string, cvrHash: string): void {
    updateCastVoteRecordHashes(this.client, cvrId, cvrHash);
  }

  clearCastVoteRecordHashes(): void {
    clearCastVoteRecordHashes(this.client);
  }

  addDiagnosticRecord(record: Omit<DiagnosticRecord, 'timestamp'>): void {
    addDiagnosticRecord(this.client, record);
  }

  getMostRecentDiagnosticRecord(
    type: DiagnosticType
  ): DiagnosticRecord | undefined {
    return getMostRecentDiagnosticRecord(this.client, type);
  }

  getMaximumUsableDiskSpace(): number {
    return getMaximumUsableDiskSpace(this.client);
  }

  updateMaximumUsableDiskSpace(space: number): void {
    updateMaximumUsableDiskSpace(this.client, space);
  }
}
