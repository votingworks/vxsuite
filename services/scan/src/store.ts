//
// The durable datastore for CVRs and configuration info.
//

import { generateBallotPageLayouts } from '@votingworks/ballot-interpreter-nh';
import {
  AnyContest,
  BallotIdSchema,
  BallotMetadata,
  BallotMetadataSchema,
  BallotPageLayout,
  BallotPageLayoutSchema,
  BallotPageMetadata,
  BallotPaperSize,
  BallotSheetInfo,
  ElectionDefinition,
  ElectionDefinitionSchema,
  getBallotStyle,
  getContests,
  MarkAdjudication,
  MarkAdjudicationsSchema,
  MarkThresholds,
  MarkThresholdsSchema,
  Optional,
  PageInterpretation,
  PageInterpretationWithFiles,
  Precinct,
  safeParseJson,
  unsafeParse,
} from '@votingworks/types';
import {
  AdjudicationStatus,
  BatchInfo,
  Side,
} from '@votingworks/types/api/services/scan';
import { assert } from '@votingworks/utils';
import { createHash } from 'crypto';
import makeDebug from 'debug';
import * as fs from 'fs-extra';
import { DateTime } from 'luxon';
import { dirname, join } from 'path';
import { Writable } from 'stream';
import { inspect } from 'util';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { buildCastVoteRecord } from './build_cast_vote_record';
import { Bindable, DbClient } from './db_client';
import { sheetRequiresAdjudication } from './interpreter';
import { SheetOf } from './types';
import { normalizeAndJoin } from './util/path';

const debug = makeDebug('scan:store');

export enum ConfigKey {
  Election = 'election',
  TestMode = 'testMode',
  MarkThresholdOverrides = 'markThresholdOverrides',
  // @deprecated
  SkipElectionHashCheck = 'skipElectionHashCheck',
  CurrentPrecinctId = 'currentPrecinctId',
}

const SchemaPath = join(__dirname, '../schema.sql');

export const ALLOWED_CONFIG_KEYS: readonly string[] = Object.values(ConfigKey);

export const DefaultMarkThresholds: Readonly<MarkThresholds> = {
  marginal: 0.17,
  definite: 0.25,
};

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
    return createHash('sha256').update(schemaSql).digest('hex');
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
   * Gets the current election definition.
   */
  getElectionDefinition(): ElectionDefinition | undefined {
    const electionDefinition: ElectionDefinition | undefined = this.getConfig(
      ConfigKey.Election,
      ElectionDefinitionSchema
    );

    if (electionDefinition) {
      return {
        ...electionDefinition,
        election: {
          markThresholds: DefaultMarkThresholds,
          ...electionDefinition.election,
        },
      };
    }

    return undefined;
  }

  /**
   * Sets the current election definition.
   */
  setElection(electionDefinition?: ElectionDefinition): void {
    this.setConfig(ConfigKey.Election, electionDefinition);
  }

  /**
   * Gets the current test mode setting value.
   */
  getTestMode(): boolean {
    // service should default to test mode if not set
    return this.getConfig(ConfigKey.TestMode, true, z.boolean());
  }

  /**
   * Gets whether to skip election hash checks.
   */
  getSkipElectionHashCheck(): boolean {
    return this.getConfig(ConfigKey.SkipElectionHashCheck, false, z.boolean());
  }

  /**
   * Sets the current test mode setting value.
   */
  setTestMode(testMode: boolean): void {
    this.setConfig(ConfigKey.TestMode, testMode);
  }

  /**
   * Sets whether to check the election hash.
   */
  setSkipElectionHashCheck(skipElectionHashCheck: boolean): void {
    this.setConfig(ConfigKey.SkipElectionHashCheck, skipElectionHashCheck);
  }

  /**
   * Gets the current override values for mark thresholds if they are set.
   * If there are no overrides set, returns undefined.
   */
  getMarkThresholdOverrides(): Optional<MarkThresholds> {
    return this.getConfig(
      ConfigKey.MarkThresholdOverrides,
      MarkThresholdsSchema
    );
  }

  getCurrentMarkThresholds(): Optional<MarkThresholds> {
    return (
      this.getMarkThresholdOverrides() ??
      this.getElectionDefinition()?.election.markThresholds
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
   * Sets the current override values for mark thresholds. A value of undefined
   * will remove overrides and cause thresholds to fallback to the default values
   * in the election definition.
   */
  setMarkThresholdOverrides(markThresholds?: MarkThresholds): void {
    this.setConfig(ConfigKey.MarkThresholdOverrides, markThresholds);
  }

  /**
   * Gets the current precinct `scan` is accepting ballots for. If set to
   * `undefined`, ballots from all precincts will be accepted (this is the
   * default).
   */
  getCurrentPrecinctId(): Optional<Precinct['id']> {
    return this.getConfig(ConfigKey.CurrentPrecinctId, z.string());
  }

  /**
   * Sets the current precinct `scan` is accepting ballots for. Set to
   * `undefined` to accept from all precincts (this is the default).
   */
  setCurrentPrecinctId(currentPrecinctId?: Precinct['id']): void {
    this.setConfig(ConfigKey.CurrentPrecinctId, currentPrecinctId);
  }

  /**
   * Gets a config value by key.
   */
  private getConfig<T>(key: ConfigKey, schema: z.ZodSchema<T>): T | undefined;
  private getConfig<T>(
    key: ConfigKey,
    defaultValue: T,
    schema: z.ZodSchema<T>
  ): T;
  private getConfig<T>(
    key: ConfigKey,
    defaultValueOrSchema: z.ZodSchema<T> | T,
    maybeSchema?: z.ZodSchema<T>
  ): T | undefined {
    debug('get config %s', key);

    const row = this.client.one<[string]>(
      'select value from configs where key = ?',
      key
    ) as { value: string } | undefined;

    let defaultValue: T | undefined;
    let schema: z.ZodSchema<T>;

    if (maybeSchema) {
      defaultValue = defaultValueOrSchema as T;
      schema = maybeSchema;
    } else {
      schema = defaultValueOrSchema as z.ZodSchema<T>;
    }

    if (typeof row === 'undefined') {
      debug('returning default value for config %s: %o', key, defaultValue);
      return defaultValue;
    }

    const result = safeParseJson(row.value, schema);

    if (result.isErr()) {
      debug('failed to validate stored config %s: %s', key, result.err());
      return undefined;
    }

    const value = result.ok();
    let inspectedResult = inspect(value, false, 2, true);
    if (inspectedResult.length > 200) {
      inspectedResult = `${inspectedResult.slice(0, 199)}…`;
    }
    debug('returning stored value for config %s: %s', key, inspectedResult);
    return value;
  }

  /**
   * Sets the current election definition.
   */
  private setConfig<T>(key: ConfigKey, value?: T): void {
    debug('set config %s=%O', key, value);
    if (typeof value === 'undefined') {
      this.client.run('delete from configs where key = ?', key);
    } else {
      this.client.run(
        'insert or replace into configs (key, value) values (?, ?)',
        key,
        JSON.stringify(value)
      );
    }
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
   * Marks all batches as exported.
   */
  markAllBatchesAsExported(): void {
    this.client.run('update batches set exported_at = current_timestamp');
  }

  /**
   * Marks all batches as not exported.
   */
  invalidateBatchesExportedAt(): void {
    this.client.run('update batches set exported_at = null');
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
      const frontFinishedAdjudicationAt =
        front.interpretation.type === 'InterpretedHmpbPage' &&
        !front.interpretation.adjudicationInfo.requiresAdjudication
          ? DateTime.now().toISOTime()
          : undefined;
      const backFinishedAdjudicationAt =
        back.interpretation.type === 'InterpretedHmpbPage' &&
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
            front_finished_adjudication_at,
            back_finished_adjudication_at
          ) values (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
        frontFinishedAdjudicationAt ?? null,
        backFinishedAdjudicationAt ?? null
      );
      this.invalidateBatchesExportedAt();
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
    this.invalidateBatchesExportedAt();
  }

  zero(): void {
    this.client.run('delete from batches');
  }

  getBallotFilenames(
    sheetId: string,
    side: Side
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
        front_finished_adjudication_at as frontFinishedAdjudicationAt,
        back_finished_adjudication_at as backFinishedAdjudicationAt
      from sheets
      where
        requires_adjudication = 1 and
        (front_finished_adjudication_at is null or back_finished_adjudication_at is null) and
        deleted_at is null
      order by created_at asc
      limit 1
      `
    ) as
      | {
          id: string;
          frontInterpretationJson: string;
          backInterpretationJson: string;
          frontFinishedAdjudicationAt: string | null;
          backFinishedAdjudicationAt: string | null;
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
            url: `/scan/hmpb/ballot/${row.id}/front/image/normalized`,
          },
          interpretation: JSON.parse(row.frontInterpretationJson),
          adjudicationFinishedAt: row.frontFinishedAdjudicationAt ?? undefined,
        },
        back: {
          image: {
            url: `/scan/hmpb/ballot/${row.id}/back/image/normalized`,
          },
          interpretation: JSON.parse(row.backInterpretationJson),
          adjudicationFinishedAt: row.backFinishedAdjudicationAt ?? undefined,
        },
      };
    }
    debug('no review sheets requiring adjudication');
  }

  *getSheets(): Generator<{
    id: string;
    front: { original: string; normalized: string };
    back: { original: string; normalized: string };
  }> {
    for (const {
      id,
      frontOriginalFilename,
      frontNormalizedFilename,
      backOriginalFilename,
      backNormalizedFilename,
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
      };
    }
  }

  adjudicateSheet(
    sheetId: string,
    side: Side,
    adjudications: readonly MarkAdjudication[]
  ): boolean {
    debug(
      'saving mark adjudications for sheet %s %s: %O',
      side,
      sheetId,
      adjudications
    );

    this.client.run(
      `
      update
        sheets
      set
        ${side}_adjudication_json = ?,
        ${side}_finished_adjudication_at = ?
      where id = ?
    `,
      JSON.stringify(adjudications, undefined, 2),
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
  batchStatus(): BatchInfo[] {
    interface SqliteBatchInfo {
      id: string;
      label: string;
      startedAt: string;
      endedAt: string | null;
      exportedAt: string | null;
      error: string | null;
      count: number;
    }
    const batchInfo = this.client.all(`
      select
        batches.id as id,
        batches.label as label,
        strftime('%s', started_at) as startedAt,
        (case when ended_at is null then ended_at else strftime('%s', ended_at) end) as endedAt,
        (case when exported_at is null then exported_at else strftime('%s', exported_at) end) as exportedAt,
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
      exportedAt:
        (info.exportedAt &&
          // eslint-disable-next-line vx/gts-safe-number-parse
          DateTime.fromSeconds(Number(info.exportedAt)).toISO()) ||
        undefined,
      error: info.error || undefined,
      count: info.count,
    }));
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
          and (front_finished_adjudication_at is null or back_finished_adjudication_at is null)
      `) as { remaining: number };
    const { adjudicated } = this.client.one(`
        select count(*) as adjudicated
        from sheets
        where
          requires_adjudication = 1
          and (front_finished_adjudication_at is not null and back_finished_adjudication_at is not null)
      `) as { adjudicated: number };
    return { adjudicated, remaining };
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  exportCvrs(writeStream: Writable): void {
    const electionDefinition = this.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('no election configured');
    }

    const sql = `
      select
        sheets.id as id,
        batches.id as batchId,
        batches.label as batchLabel,
        front_interpretation_json as frontInterpretationJson,
        back_interpretation_json as backInterpretationJson,
        front_adjudication_json as frontAdjudicationJson,
        back_adjudication_json as backAdjudicationJson
      from sheets left join batches
      on sheets.batch_id = batches.id
      where
        (requires_adjudication = 0 or
        (front_finished_adjudication_at is not null and back_finished_adjudication_at is not null))
        and sheets.deleted_at is null
        and batches.deleted_at is null
    `;
    for (const {
      id,
      batchId,
      batchLabel,
      frontInterpretationJson,
      backInterpretationJson,
      frontAdjudicationJson,
      backAdjudicationJson,
    } of this.client.each(sql) as Iterable<{
      id: string;
      batchId: string;
      batchLabel: string | null;
      frontInterpretationJson: string;
      backInterpretationJson: string;
      frontAdjudicationJson: string | null;
      backAdjudicationJson: string | null;
    }>) {
      const frontInterpretation: PageInterpretation = JSON.parse(
        frontInterpretationJson
      );
      const backInterpretation: PageInterpretation = JSON.parse(
        backInterpretationJson
      );
      const frontAdjudications = frontAdjudicationJson
        ? safeParseJson(frontAdjudicationJson, MarkAdjudicationsSchema).ok()
        : undefined;
      const backAdjudications = backAdjudicationJson
        ? safeParseJson(backAdjudicationJson, MarkAdjudicationsSchema).ok()
        : undefined;
      const cvr = buildCastVoteRecord(
        id,
        batchId,
        batchLabel || '',
        (frontInterpretation.type === 'InterpretedBmdPage' &&
          frontInterpretation.ballotId) ||
          (backInterpretation.type === 'InterpretedBmdPage' &&
            backInterpretation.ballotId) ||
          unsafeParse(BallotIdSchema, id),
        electionDefinition.election,
        [
          {
            interpretation: frontInterpretation,
            contestIds:
              frontInterpretation.type === 'InterpretedHmpbPage' ||
              frontInterpretation.type === 'UninterpretedHmpbPage'
                ? this.getContestIdsForMetadata(frontInterpretation.metadata)
                : undefined,
            markAdjudications: frontAdjudications,
          },
          {
            interpretation: backInterpretation,
            contestIds:
              backInterpretation.type === 'InterpretedHmpbPage' ||
              backInterpretation.type === 'UninterpretedHmpbPage'
                ? this.getContestIdsForMetadata(backInterpretation.metadata)
                : undefined,
            markAdjudications: backAdjudications,
          },
        ]
      );

      if (cvr) {
        writeStream.write(JSON.stringify(cvr));
        writeStream.write('\n');
      }
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

  getBallotLayoutsForMetadata(
    metadata: BallotPageMetadata
  ): BallotPageLayout[] {
    const electionDefinition = this.getElectionDefinition();

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
    metadata: BallotPageMetadata
  ): Array<AnyContest['id']> {
    const electionDefinition = this.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('no election configured');
    }

    const layouts = this.getBallotLayoutsForMetadata(metadata);
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
