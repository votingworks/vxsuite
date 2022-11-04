//
// The durable datastore for CVRs and configuration info.
//

import { Scan } from '@votingworks/api';
import { generateBallotPageLayouts } from '@votingworks/ballot-interpreter-nh';
import { Bindable, Client as DbClient } from '@votingworks/db';
import {
  AnyContest,
  BallotMetadata,
  BallotMetadataSchema,
  BallotPageLayout,
  BallotPageLayoutSchema,
  BallotPageMetadata,
  BallotPaperSize,
  BallotSheetInfo,
  ElectionDefinition,
  getBallotStyle,
  getContests,
  Id,
  Iso8601Timestamp,
  mapSheet,
  MarkThresholds,
  Optional,
  PageInterpretation,
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
} from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import * as fs from 'fs-extra';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import { dirname, join } from 'path';
import { inspect } from 'util';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { sheetRequiresAdjudication } from './interpreter';
import { normalizeAndJoin } from './util/path';

const debug = makeDebug('scan:store');

const SchemaPath = join(__dirname, '../schema.sql');

export const DefaultMarkThresholds: Readonly<MarkThresholds> = {
  marginal: 0.17,
  definite: 0.25,
};

export interface ResultSheet {
  readonly id: Id;
  readonly batchId: Id;
  readonly batchLabel?: string;
  readonly interpretation: SheetOf<PageInterpretation>;
}

/**
 * Manages a data store for imported ballot image batches and cast vote records
 * interpreted by reading the sheets.
 */
export class Store {
  private constructor(private readonly client: DbClient) {}

  getDbPath(): string {
    return this.client.getDatabasePath();
  }

  /**
   * Gets the sha256 digest of the current schema file.
   */
  static getSchemaDigest(): string {
    const schemaSql = fs.readFileSync(SchemaPath, 'utf-8');
    return sha256(schemaSql);
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
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * store.dbRun('insert into muppets (name) values (?)', 'Kermit')
   *
   * @deprecated provide a method to do whatever callers need to do
   */
  dbRun<P extends Bindable[]>(sql: string, ...params: P): void {
    return this.client.run(sql, ...params);
  }

  /**
   * Executes `sql`, which can be multiple statements.
   *
   * @example
   *
   * store.dbExec(`
   *   pragma foreign_keys = 1;
   *
   *   create table if not exist muppets (name varchar(255));
   *   create table if not exist images (url integer unique not null);
   * `)
   *
   * @deprecated provide a method to do whatever callers need to do
   */
  dbExec(sql: string): void {
    return this.client.exec(sql);
  }

  /**
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * store.dbAll('select * from muppets')
   *
   * @deprecated provide a method to do whatever callers need to do
   */
  dbAll<P extends Bindable[] = []>(sql: string, ...params: P): unknown[] {
    return this.client.all(sql, ...params);
  }

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * store.dbGet('select count(*) as count from muppets')
   *
   * @deprecated provide a method to do whatever callers need to do
   */
  dbGet<P extends Bindable[] = []>(sql: string, ...params: P): unknown {
    return this.client.one(sql, ...params);
  }

  /**
   * Writes a copy of the database to the given path.
   */
  backup(filepath: string): void {
    this.client.run('vacuum into ?', filepath);
  }

  /**
   * Resets the database.
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
        markThresholds: DefaultMarkThresholds,
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
   * Gets whether to skip election hash checks.
   */
  getSkipElectionHashCheck(): boolean {
    const electionRow = this.client.one(
      'select skip_election_hash_check as skipElectionHashCheck from election'
    ) as { skipElectionHashCheck: number } | undefined;

    if (!electionRow) {
      // we will not skip the check by default once an election is defined
      return false;
    }

    return Boolean(electionRow.skipElectionHashCheck);
  }

  /**
   * Sets whether to check the election hash.
   */
  setSkipElectionHashCheck(skipElectionHashCheck: boolean): void {
    if (!this.hasElection()) {
      throw new Error(
        'Cannot set to skip election hash check without an election.'
      );
    }

    this.client.run(
      'update election set skip_election_hash_check = ?',
      skipElectionHashCheck ? 1 : 0
    );
  }

  getBallotPaperSizeForElection(): BallotPaperSize {
    const electionDefinition = this.getElectionDefinition();
    return (
      electionDefinition?.election.ballotLayout?.paperSize ??
      BallotPaperSize.Letter
    );
  }

  /**
   * Gets the current override values for mark thresholds if they are set.
   * If there are no overrides set, returns undefined.
   */
  getMarkThresholdOverrides(): Optional<MarkThresholds> {
    const electionRow = this.client.one(
      'select marginal_mark_threshold_override as MarginalMarkThresholdOverride, definite_mark_threshold_override as DefiniteMarkThresholdOverride from election'
    ) as
      | {
          MarginalMarkThresholdOverride?: number;
          DefiniteMarkThresholdOverride?: number;
        }
      | undefined;

    if (!electionRow) {
      return undefined;
    }

    if (electionRow.DefiniteMarkThresholdOverride) {
      assert(typeof electionRow.MarginalMarkThresholdOverride === 'number');
      return {
        marginal: electionRow.MarginalMarkThresholdOverride,
        definite: electionRow.DefiniteMarkThresholdOverride,
      };
    }

    return undefined;
  }

  getCurrentMarkThresholds(): Optional<MarkThresholds> {
    return (
      this.getMarkThresholdOverrides() ??
      this.getElectionDefinition()?.election.markThresholds
    );
  }

  /**
   * Sets the current override values for mark thresholds. A value of undefined
   * will remove overrides and cause thresholds to fallback to the default values
   * in the election definition.
   */
  setMarkThresholdOverrides(markThresholds?: MarkThresholds): void {
    if (!this.hasElection()) {
      throw new Error('Cannot set mark thresholds without an election.');
    }

    if (!markThresholds) {
      this.client.run(
        'update election set definite_mark_threshold_override = null, marginal_mark_threshold_override = null'
      );
    } else {
      this.client.run(
        'update election set definite_mark_threshold_override = ?, marginal_mark_threshold_override = ?',
        markThresholds.definite,
        markThresholds.marginal
      );
    }
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

    if (!precinctSelection) {
      this.client.run('update election set precinct_selection = null');
    } else {
      this.client.run(
        'update election set precinct_selection = ?',
        JSON.stringify(precinctSelection)
      );
    }
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
   * Records that batches have been backed up.
   */
  setScannerAsBackedUp(): void {
    if (this.hasElection()) {
      this.client.run(
        'update election set scanner_backed_up_at = current_timestamp'
      );
    } else {
      throw new Error('Unconfigured scanner cannot be backed up.');
    }
  }

  /**
   * Records that CVRs have been backed up.
   */
  setCvrsAsBackedUp(): void {
    if (this.hasElection()) {
      this.client.run(
        'update election set cvrs_backed_up_at = current_timestamp'
      );
    } else {
      throw new Error('Unconfigured scanner cannot have exported cvrs.');
    }
  }

  /**
   * Gets the timestamp for the last scanner backup
   */
  getScannerBackupTimestamp(): Iso8601Timestamp | undefined {
    const row = this.client.one(
      'select scanner_backed_up_at as scannerBackedUpAt from election'
    ) as { scannerBackedUpAt: Iso8601Timestamp } | undefined;
    return row?.scannerBackedUpAt;
  }

  /**
   * Gets the timestamp for the last cvr export
   */
  getCvrsBackupTimestamp(): Iso8601Timestamp | undefined {
    const row = this.client.one(
      'select cvrs_backed_up_at as cvrsBackedUpAt from election'
    ) as { cvrsBackedUpAt: Iso8601Timestamp } | undefined;
    return row?.cvrsBackedUpAt;
  }

  /**
   * Returns whether the appropriate backups have been completed and it is safe
   * to unconfigure a machine/zero out data. Always returns true in test mode.
   */
  getCanUnconfigure(): boolean {
    // Always allow unconfiguring a machine in test mode
    if (this.getTestMode()) {
      return true;
    }

    const scannerBackedUpAt = this.getScannerBackupTimestamp();

    if (!this.batchStatus().length) {
      return true;
    }

    // Require that a scanner backup has taken place
    if (!scannerBackedUpAt) {
      return false;
    }

    const { maxCvrsCreatedAt, maxCvrsDeletedAt } = this.client.one(
      'select max(created_at) as maxCvrsCreatedAt, max(deleted_at) as maxCvrsDeletedAt from sheets'
    ) as {
      maxCvrsCreatedAt: Iso8601Timestamp;
      maxCvrsDeletedAt: Iso8601Timestamp;
    };
    const { maxBatchesStartedAt, maxBatchesDeletedAt } = this.client.one(
      'select max(started_at) as maxBatchesStartedAt, max(deleted_at) as maxBatchesDeletedAt from batches'
    ) as {
      maxBatchesStartedAt: Iso8601Timestamp;
      maxBatchesDeletedAt: Iso8601Timestamp;
    };

    const cvrsLastUpdatedAt = [maxCvrsCreatedAt, maxCvrsDeletedAt]
      .filter(Boolean)
      .reduce((max, curr) => (max > curr ? max : curr), '');
    const batchesLastUpdatedAt = [maxBatchesStartedAt, maxBatchesDeletedAt]
      .filter(Boolean)
      .reduce((max, curr) => (max > curr ? max : curr), '');

    if (!batchesLastUpdatedAt) {
      return true;
    }

    const isBackupUpToDate =
      scannerBackedUpAt >= cvrsLastUpdatedAt &&
      scannerBackedUpAt >= batchesLastUpdatedAt;
    return isBackupUpToDate;
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
    [front, back]: SheetOf<PageInterpretationWithFiles>
  ): string {
    try {
      const finishedAdjudicationAt =
        front.interpretation.type === 'InterpretedHmpbPage' &&
        back.interpretation.type === 'InterpretedHmpbPage' &&
        !front.interpretation.adjudicationInfo.requiresAdjudication &&
        !back.interpretation.adjudicationInfo.requiresAdjudication
          ? DateTime.now().toISOTime()
          : undefined;

      this.client.run(
        `insert into sheets (
            id,
            batch_id,
            front_original_filename,
            front_normalized_filename,
            front_interpretation_json,
            back_original_filename,
            back_normalized_filename,
            back_interpretation_json,
            requires_adjudication,
            finished_adjudication_at
          ) values (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )`,
        sheetId,
        batchId,
        front.originalFilename,
        front.normalizedFilename,
        JSON.stringify(front.interpretation),
        back.originalFilename,
        back.normalizedFilename,
        JSON.stringify(back.interpretation ?? {}),
        sheetRequiresAdjudication([front.interpretation, back.interpretation])
          ? 1
          : 0,
        finishedAdjudicationAt ?? null
      );
    } catch (error) {
      debug(
        'sheet insert failed; maybe a duplicate? filenames=[%s, %s]',
        front.originalFilename,
        back.originalFilename
      );

      const row = this.client.one<[string]>(
        'select id from sheets where front_original_filename = ?',
        front.originalFilename
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
        this.client.run(
          'update election set cvrs_backed_up_at = null, scanner_backed_up_at = null'
        );
        this.setPollsState('polls_closed_initial');
      });
    }
  }

  zero(): void {
    this.client.run('delete from batches');
    // reset autoincrementing key on "batches" table
    this.client.run("delete from sqlite_sequence where name = 'batches'");
    this.resetElectionSession();
  }

  getBallotFilenames(
    sheetId: string,
    side: Scan.Side
  ): { original: string; normalized: string } | undefined {
    const row = this.client.one<[string]>(
      `
      select
        ${side}_original_filename as original,
        ${side}_normalized_filename as normalized
      from
        sheets
      where
        id = ?
    `,
      sheetId
    ) as { original: string; normalized: string } | undefined;

    if (!row) {
      return;
    }

    return {
      original: normalizeAndJoin(dirname(this.getDbPath()), row.original),
      normalized: normalizeAndJoin(dirname(this.getDbPath()), row.normalized),
    };
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
            url: `/central-scanner/scan/hmpb/ballot/${row.id}/front/image/normalized`,
          },
          interpretation: JSON.parse(row.frontInterpretationJson),
          adjudicationFinishedAt: row.finishedAdjudicationAt ?? undefined,
        },
        back: {
          image: {
            url: `/central-scanner/scan/hmpb/ballot/${row.id}/back/image/normalized`,
          },
          interpretation: JSON.parse(row.backInterpretationJson),
          adjudicationFinishedAt: row.finishedAdjudicationAt ?? undefined,
        },
      };
    }
    debug('no review sheets requiring adjudication');
  }

  *getSheets(): Generator<{
    id: string;
    front: { original: string; normalized: string };
    back: { original: string; normalized: string };
    exportedAsCvrAt: Iso8601Timestamp;
  }> {
    for (const {
      id,
      frontOriginalFilename,
      frontNormalizedFilename,
      backOriginalFilename,
      backNormalizedFilename,
      exportedAsCvrAt,
    } of this.client.each(`
      select
        id,
        front_original_filename as frontOriginalFilename,
        front_normalized_filename as frontNormalizedFilename,
        back_original_filename as backOriginalFilename,
        back_normalized_filename as backNormalizedFilename
      from sheets
      order by created_at asc
    `) as Iterable<{
      id: string;
      frontOriginalFilename: string;
      frontNormalizedFilename: string;
      backOriginalFilename: string;
      backNormalizedFilename: string;
      exportedAsCvrAt: Iso8601Timestamp;
    }>) {
      yield {
        id,
        front: {
          original: frontOriginalFilename,
          normalized: frontNormalizedFilename,
        },
        back: {
          original: backOriginalFilename,
          normalized: backNormalizedFilename,
        },
        exportedAsCvrAt,
      };
    }
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
  batchStatus(): Scan.BatchInfo[] {
    interface SqliteBatchInfo {
      id: string;
      label: string;
      startedAt: string;
      endedAt: string | null;
      error: string | null;
      count: number;
    }
    const batchInfo = this.client.all(`
      select
        batches.id as id,
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
   * Gets adjudication status.
   */
  adjudicationStatus(): Scan.AdjudicationStatus {
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
   * Yields all sheets in the database that would be included in a CVR export.
   */
  *forEachResultSheet(options?: {
    orderBySheetId?: boolean;
  }): Generator<ResultSheet> {
    const sql = `
      select
        sheets.id as id,
        batches.id as batchId,
        batches.label as batchLabel,
        front_interpretation_json as frontInterpretationJson,
        back_interpretation_json as backInterpretationJson
      from sheets left join batches
      on sheets.batch_id = batches.id
      where
        (requires_adjudication = 0 or finished_adjudication_at is not null)
        and sheets.deleted_at is null
        and batches.deleted_at is null
      ${options?.orderBySheetId ? 'order by sheets.id' : ''}
    `;
    for (const row of this.client.each(sql) as Iterable<{
      id: string;
      batchId: string;
      batchLabel: string | null;
      frontInterpretationJson: string;
      backInterpretationJson: string;
    }>) {
      yield {
        id: row.id,
        batchId: row.batchId,
        batchLabel: row.batchLabel ?? undefined,
        interpretation: mapSheet(
          [row.frontInterpretationJson, row.backInterpretationJson],
          (json) => safeParseJson(json, PageInterpretationSchema).unsafeUnwrap()
        ),
      };
    }
  }

  addHmpbTemplate(
    pdf: Buffer,
    metadata: BallotMetadata,
    layouts: readonly BallotPageLayout[]
  ): string {
    debug('storing HMPB template: %O', metadata);

    this.client.run(
      `
      delete from hmpb_templates
      where json_extract(metadata_json, '$.locales.primary') = ?
      and json_extract(metadata_json, '$.locales.secondary') = ?
      and json_extract(metadata_json, '$.ballotStyleId') = ?
      and json_extract(metadata_json, '$.precinctId') = ?
      and json_extract(metadata_json, '$.isTestMode') = ?
      `,
      metadata.locales.primary,
      metadata.locales.secondary ?? null,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestMode ? 1 : 0
    );

    const id = uuid();
    this.client.run(
      `
      insert into hmpb_templates (
        id,
        pdf,
        metadata_json,
        layouts_json
      ) values (
        ?, ?, ?, ?
      )
      `,
      id,
      pdf,
      JSON.stringify(metadata),
      JSON.stringify(layouts)
    );
    return id;
  }

  getHmpbTemplates(): Array<[Buffer, BallotPageLayout[]]> {
    const rows = this.client.all(
      `
        select
          id,
          pdf,
          metadata_json as metadataJson,
          layouts_json as layoutsJson
        from hmpb_templates
        order by created_at asc
      `
    ) as Array<{
      id: string;
      pdf: Buffer;
      layoutsJson: string;
      metadataJson: string;
    }>;
    const results: Array<[Buffer, BallotPageLayout[]]> = [];

    for (const { id, pdf, metadataJson, layoutsJson } of rows) {
      const metadata = safeParseJson(
        metadataJson,
        BallotMetadataSchema
      ).unsafeUnwrap();
      debug('loading stored HMPB template id=%s: %O', id, metadata);
      const layouts: BallotPageLayout[] = safeParseJson(
        layoutsJson,
        z.array(BallotPageLayoutSchema)
      ).unsafeUnwrap();
      results.push([
        pdf,
        layouts.map((layout, i) => ({
          ...layout,
          metadata: {
            ...metadata,
            pageNumber: i + 1,
          },
        })),
      ]);
    }

    return results;
  }

  getBallotPageLayoutForMetadata(
    metadata: BallotPageMetadata,
    electionDefinition?: ElectionDefinition
  ): BallotPageLayout | undefined {
    return this.getBallotPageLayoutsForMetadata(
      metadata,
      electionDefinition
    ).find((layout) => layout.metadata.pageNumber === metadata.pageNumber);
  }

  getBallotPageLayoutsForMetadata(
    metadata: BallotMetadata,
    electionDefinition = this.getElectionDefinition()
  ): BallotPageLayout[] {
    // Handle timing mark ballots differently. We should have the layout from
    // the scan/interpret process, but since we don't right now we generate it
    // from what we expect the layout to be instead. This means there could be
    // some error in the layout, but it's better than nothing.
    if (electionDefinition?.election.gridLayouts) {
      return generateBallotPageLayouts(
        electionDefinition.election,
        metadata
      ).unsafeUnwrap();
    }

    const rows = this.client.all(
      `
        select
          layouts_json as layoutsJson,
          metadata_json as metadataJson
        from hmpb_templates
      `
    ) as Array<{
      layoutsJson: string;
      metadataJson: string;
    }>;

    for (const row of rows) {
      const { locales, ballotStyleId, precinctId, isTestMode } = safeParseJson(
        row.metadataJson,
        BallotMetadataSchema
      ).unsafeUnwrap();

      if (
        metadata.locales.primary === locales.primary &&
        metadata.locales.secondary === locales.secondary &&
        metadata.ballotStyleId === ballotStyleId &&
        metadata.precinctId === precinctId &&
        metadata.isTestMode === isTestMode
      ) {
        return safeParseJson(
          row.layoutsJson,
          z.array(BallotPageLayoutSchema)
        ).unsafeUnwrap();
      }
    }

    throw new Error(
      `no ballot layouts found matching metadata: ${inspect(metadata)}`
    );
  }

  getContestIdsForMetadata(
    metadata: BallotPageMetadata,
    electionDefinition = this.getElectionDefinition()
  ): Array<AnyContest['id']> {
    if (!electionDefinition) {
      throw new Error('no election configured');
    }

    const layouts = this.getBallotPageLayoutsForMetadata(
      metadata,
      electionDefinition
    );
    let contestOffset = 0;

    for (const layout of layouts) {
      if (layout.metadata.pageNumber === metadata.pageNumber) {
        const ballotStyle = getBallotStyle({
          election: electionDefinition.election,
          ballotStyleId: metadata.ballotStyleId,
        });
        assert(ballotStyle);
        const contests = getContests({
          election: electionDefinition.election,
          ballotStyle,
        });

        return contests
          .slice(contestOffset, contestOffset + layout.contests.length)
          .map(({ id }) => id);
      }

      contestOffset += layout.contests.length;
    }

    throw new Error(
      `unable to find page with pageNumber=${metadata.pageNumber}`
    );
  }
}
