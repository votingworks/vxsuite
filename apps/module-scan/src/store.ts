//
// The durable datastore for CVRs and configuration info.
//

import {
  AnyContest,
  BallotMetadata,
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
  Precinct,
  safeParseJSON,
  SerializableBallotPageLayout,
} from '@votingworks/types';
import {
  AdjudicationStatus,
  BatchInfo,
  Side,
} from '@votingworks/types/api/module-scan';
import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import makeDebug from 'debug';
import { promises as fs } from 'fs';
import { DateTime } from 'luxon';
import { dirname, join } from 'path';
import * as sqlite3 from 'sqlite3';
import { Writable } from 'stream';
import { inspect } from 'util';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { buildCastVoteRecord } from './buildCastVoteRecord';
import { sheetRequiresAdjudication } from './interpreter';
import { PageInterpretationWithFiles, SheetOf } from './types';
import { normalizeAndJoin } from './util/path';

const debug = makeDebug('module-scan:store');

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
export default class Store {
  private db?: sqlite3.Database;

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(readonly dbPath: string) {}

  /**
   * Gets the sha256 digest of the current schema file.
   */
  static async getSchemaDigest(): Promise<string> {
    const schemaSql = await fs.readFile(SchemaPath, 'utf-8');
    return createHash('sha256').update(schemaSql).digest('hex');
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  static async memoryStore(): Promise<Store> {
    const store = new Store(':memory:');
    await store.dbCreate();
    return store;
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  static async fileStore(dbPath: string): Promise<Store> {
    const schemaDigestPath = `${dbPath}.digest`;
    let schemaDigest: string | undefined;
    try {
      schemaDigest = (await fs.readFile(schemaDigestPath, 'utf-8')).trim();
    } catch {
      debug(
        'could not read %s, assuming the database needs to be created',
        schemaDigestPath
      );
    }
    const newSchemaDigest = await this.getSchemaDigest();
    const shouldResetDatabase = newSchemaDigest !== schemaDigest;

    if (shouldResetDatabase) {
      debug(
        'database schema has changed (%s ≉ %s)',
        schemaDigest,
        newSchemaDigest
      );
      try {
        const backupPath = `${dbPath}.backup-${new Date()
          .toISOString()
          .replace(/[^\d]+/g, '-')
          .replace(/-+$/, '')}`;
        await fs.rename(dbPath, backupPath);
        debug('backed up database to be reset to %s', backupPath);
      } catch {
        // ignore for now
      }
    }

    const store = new Store(dbPath);

    if (shouldResetDatabase) {
      debug('resetting database to updated schema');
      await store.reset();
      await fs.writeFile(schemaDigestPath, newSchemaDigest, 'utf-8');
    } else {
      debug('database schema appears to be up to date');
    }

    return store;
  }

  /**
   * Gets the underlying sqlite3 database.
   */
  private async getDb(): Promise<sqlite3.Database> {
    if (!this.db) {
      return this.dbConnect();
    }
    return this.db;
  }

  /**
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * await store.dbRunAsync('insert into muppets (name) values (?)', 'Kermit')
   */
  async dbRunAsync<P extends unknown[]>(
    sql: string,
    ...params: P
  ): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.run(sql, ...params, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, params, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Executes `sql`, which can be multiple statements.
   *
   * @example
   *
   * await store.dbExecAsync(`
   *   pragma foreign_keys = 1;
   *
   *   create table if not exist muppets (name varchar(255));
   *   create table if not exist images (url integer unique not null);
   * `)
   */
  async dbExecAsync(sql: string): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.exec(sql, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * await store.dbAllAsync('select * from muppets')
   */
  async dbAllAsync<T, P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<T[]> {
    const db = await this.getDb();
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err: unknown, rows: T[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * await store.dbGetAsync('select count(*) as count from muppets')
   */
  async dbGetAsync<T, P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<T> {
    const db = await this.getDb();
    return new Promise<T>((resolve, reject) => {
      db.get(sql, params, (err: unknown, row: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * Deletes the entire database, including its on-disk representation.
   */
  async dbDestroy(): Promise<void> {
    const db = await this.getDb();
    return new Promise((resolve) => {
      db.close(async () => {
        try {
          debug('deleting the database file at %s', this.dbPath);
          await fs.unlink(this.dbPath);
        } catch (error) {
          debug(
            'failed to delete database file %s: %s',
            this.dbPath,
            error.message
          );
        }

        resolve();
      });
    });
  }

  async dbConnect(): Promise<sqlite3.Database> {
    debug('connecting to the database at %s', this.dbPath);
    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(db);
        }
      });
    });

    // Enforce foreign key constraints. This is not in schema.sql because that
    // only runs on db creation.
    await this.dbRunAsync('pragma foreign_keys = 1');

    return this.db;
  }

  /**
   * Creates the database including its tables.
   */
  async dbCreate(): Promise<sqlite3.Database> {
    debug('creating the database at %s', this.dbPath);
    const db = await this.dbConnect();
    await this.dbExecAsync(await fs.readFile(SchemaPath, 'utf-8'));
    return db;
  }

  /**
   * Writes a copy of the database to the given path.
   */
  async backup(filepath: string): Promise<void> {
    await this.dbRunAsync('vacuum into ?', filepath);
  }

  /**
   * Resets the database.
   */
  async reset(): Promise<void> {
    if (this.db) {
      await this.dbDestroy();
    }

    await this.dbCreate();
  }

  /**
   * Gets the current election definition.
   */
  async getElectionDefinition(): Promise<ElectionDefinition | undefined> {
    const electionDefinition:
      | ElectionDefinition
      | undefined = await this.getConfig(
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
  async setElection(electionDefinition?: ElectionDefinition): Promise<void> {
    await this.setConfig(ConfigKey.Election, electionDefinition);
  }

  /**
   * Gets the current test mode setting value.
   */
  async getTestMode(): Promise<boolean> {
    return await this.getConfig(ConfigKey.TestMode, false, z.boolean());
  }

  /**
   * Gets whether to skip election hash checks.
   */
  async getSkipElectionHashCheck(): Promise<boolean> {
    return await this.getConfig(
      ConfigKey.SkipElectionHashCheck,
      false,
      z.boolean()
    );
  }

  /**
   * Sets the current test mode setting value.
   */
  async setTestMode(testMode: boolean): Promise<void> {
    await this.setConfig(ConfigKey.TestMode, testMode);
  }

  /**
   * Sets whether to check the election hash.
   */
  async setSkipElectionHashCheck(
    skipElectionHashCheck: boolean
  ): Promise<void> {
    await this.setConfig(
      ConfigKey.SkipElectionHashCheck,
      skipElectionHashCheck
    );
  }

  /**
   * Gets the current override values for mark thresholds if they are set.
   * If there are no overrides set, returns undefined.
   */
  async getMarkThresholdOverrides(): Promise<Optional<MarkThresholds>> {
    return await this.getConfig(
      ConfigKey.MarkThresholdOverrides,
      MarkThresholdsSchema
    );
  }

  async getCurrentMarkThresholds(): Promise<Optional<MarkThresholds>> {
    return (
      (await this.getMarkThresholdOverrides()) ??
      (await this.getElectionDefinition())?.election.markThresholds
    );
  }

  async getBallotPaperSizeForElection(): Promise<BallotPaperSize> {
    const electionDefinition = await this.getElectionDefinition();
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
  async setMarkThresholdOverrides(
    markThresholds?: MarkThresholds
  ): Promise<void> {
    await this.setConfig(ConfigKey.MarkThresholdOverrides, markThresholds);
  }

  /**
   * Gets the current precinct `module-scan` is accepting ballots for. If set to
   * `undefined`, ballots from all precincts will be accepted (this is the
   * default).
   */
  async getCurrentPrecinctId(): Promise<Optional<Precinct['id']>> {
    return this.getConfig(ConfigKey.CurrentPrecinctId, z.string());
  }

  /**
   * Sets the current precinct `module-scan` is accepting ballots for. Set to
   * `undefined` to accept from all precincts (this is the default).
   */
  async setCurrentPrecinctId(
    currentPrecinctId?: Precinct['id']
  ): Promise<void> {
    await this.setConfig(ConfigKey.CurrentPrecinctId, currentPrecinctId);
  }

  /**
   * Gets a config value by key.
   */
  private async getConfig<T>(
    key: ConfigKey,
    schema: z.ZodSchema<T>
  ): Promise<T | undefined>;
  private async getConfig<T>(
    key: ConfigKey,
    defaultValue: T,
    schema: z.ZodSchema<T>
  ): Promise<T>;
  private async getConfig<T>(
    key: ConfigKey,
    defaultValueOrSchema: z.ZodSchema<T> | T,
    maybeSchema?: z.ZodSchema<T>
  ): Promise<T | undefined> {
    debug('get config %s', key);

    const row = await this.dbGetAsync<{ value: string } | undefined, [string]>(
      'select value from configs where key = ?',
      key
    );

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

    const result = safeParseJSON(row.value, schema);

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
  private async setConfig<T>(key: ConfigKey, value?: T): Promise<void> {
    debug('set config %s=%O', key, value);
    if (typeof value === 'undefined') {
      await this.dbRunAsync('delete from configs where key = ?', key);
    } else {
      await this.dbRunAsync(
        'insert or replace into configs (key, value) values (?, ?)',
        key,
        JSON.stringify(value)
      );
    }
  }

  /**
   * Adds a batch and returns its id.
   */
  async addBatch(): Promise<string> {
    const id = uuid();
    await this.dbRunAsync('insert into batches (id) values (?)', id);
    await this.dbRunAsync(
      'update batches set label= "Batch " || batch_number WHERE id = ?',
      id
    );
    return id;
  }

  /**
   * Marks the batch with id `batchId` as finished.
   */
  async finishBatch({
    batchId,
    error,
  }: {
    batchId: string;
    error?: string;
  }): Promise<void> {
    await this.dbRunAsync(
      'update batches set ended_at = current_timestamp, error = ? where id = ?',
      error,
      batchId
    );
  }

  async addBallotCard(batchId: string): Promise<string> {
    const id = uuid();
    await this.dbRunAsync(
      'insert into ballot_cards (id, batch_id) values (?, ?)',
      id,
      batchId
    );
    return id;
  }

  /**
   * Adds a sheet to an existing batch.
   */
  async addSheet(
    sheetId: string,
    batchId: string,
    [front, back]: SheetOf<PageInterpretationWithFiles>
  ): Promise<string> {
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
      await this.dbRunAsync(
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
        sheetRequiresAdjudication([front.interpretation, back.interpretation]),
        frontFinishedAdjudicationAt,
        backFinishedAdjudicationAt
      );
    } catch (error) {
      debug(
        'sheet insert failed; maybe a duplicate? filenames=[%s, %s]',
        front.originalFilename,
        back.originalFilename
      );

      const row = await this.dbGetAsync<{ id: string } | undefined, [string]>(
        'select id from sheets where front_original_filename = ?',
        front.originalFilename
      );

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
  async deleteSheet(sheetId: string): Promise<void> {
    await this.dbRunAsync(
      'update sheets set deleted_at = current_timestamp where id = ?',
      sheetId
    );
  }

  async zero(): Promise<void> {
    await this.dbRunAsync('delete from batches');
  }

  async getBallotFilenames(
    ballotId: string,
    side: Side
  ): Promise<{ original: string; normalized: string } | undefined> {
    const row = await this.dbGetAsync<
      { original: string; normalized: string } | undefined,
      [string]
    >(
      `
      select
        ${side}_original_filename as original,
        ${side}_normalized_filename as normalized
      from
        sheets
      where
        id = ?
    `,
      ballotId
    );

    if (!row) {
      return;
    }

    return {
      original: normalizeAndJoin(dirname(this.dbPath), row.original),
      normalized: normalizeAndJoin(dirname(this.dbPath), row.normalized),
    };
  }

  async getNextAdjudicationSheet(): Promise<BallotSheetInfo | undefined> {
    const row = await this.dbGetAsync<
      | {
          id: string;
          frontInterpretationJSON: string;
          backInterpretationJSON: string;
          frontFinishedAdjudicationAt?: string;
          backFinishedAdjudicationAt?: string;
        }
      | undefined
    >(
      `
      select
        id,
        front_interpretation_json as frontInterpretationJSON,
        back_interpretation_json as backInterpretationJSON,
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
    );

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
          interpretation: JSON.parse(row.frontInterpretationJSON),
          adjudicationFinishedAt: row.frontFinishedAdjudicationAt,
        },
        back: {
          image: {
            url: `/scan/hmpb/ballot/${row.id}/back/image/normalized`,
          },
          interpretation: JSON.parse(row.backInterpretationJSON),
          adjudicationFinishedAt: row.backFinishedAdjudicationAt,
        },
      };
    }
    debug('no review sheets requiring adjudication');
  }

  async *getSheets(): AsyncGenerator<{
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
    } of await this.dbAllAsync<{
      id: string;
      frontOriginalFilename: string;
      frontNormalizedFilename: string;
      backOriginalFilename: string;
      backNormalizedFilename: string;
    }>(`
      select
        id,
        front_original_filename as frontOriginalFilename,
        front_normalized_filename as frontNormalizedFilename,
        back_original_filename as backOriginalFilename,
        back_normalized_filename as backNormalizedFilename
      from sheets
      order by created_at asc
    `)) {
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

  async adjudicateSheet(
    sheetId: string,
    side: Side,
    adjudications: readonly MarkAdjudication[]
  ): Promise<boolean> {
    debug(
      'saving mark adjudications for sheet %s %s: %O',
      side,
      sheetId,
      adjudications
    );

    await this.dbRunAsync(
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
   * Deletes the batch with id `batchId`.
   */
  async deleteBatch(batchId: string): Promise<boolean> {
    const { count }: { count: number } = await this.dbGetAsync(
      'select count(*) as count from batches where id = ?',
      batchId
    );
    await this.dbRunAsync('delete from batches where id = ?', batchId);
    return count > 0;
  }

  /**
   * Cleanup partial batches
   */
  async cleanupIncompleteBatches(): Promise<void> {
    // cascades to the sheets
    await this.dbRunAsync('delete from batches where ended_at is null');
  }

  /**
   * Gets all batches, including their sheet count.
   */
  async batchStatus(): Promise<BatchInfo[]> {
    interface SqliteBatchInfo {
      id: string;
      label: string;
      startedAt: string;
      endedAt: string | null;
      error: string | null;
      count: number;
    }
    const batchInfo = await this.dbAllAsync<SqliteBatchInfo>(`
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
      where
        deleted_at is null
      group by
        batches.id,
        batches.started_at,
        batches.ended_at,
        error
      order by
        batches.started_at desc
    `);
    return batchInfo.map((info) => ({
      id: info.id,
      label: info.label,
      startedAt: DateTime.fromSeconds(Number(info.startedAt)).toISO(),
      endedAt:
        (info.endedAt && DateTime.fromSeconds(Number(info.endedAt)).toISO()) ||
        undefined,
      error: info.error || undefined,
      count: info.count,
    }));
  }

  /**
   * Gets adjudication status.
   */
  async adjudicationStatus(): Promise<AdjudicationStatus> {
    const [{ remaining }, { adjudicated }] = await Promise.all([
      this.dbGetAsync<{ remaining: number }>(`
        select count(*) as remaining
        from sheets
        where
          requires_adjudication = 1
          and deleted_at is null
          and (front_finished_adjudication_at is null or back_finished_adjudication_at is null)
      `),
      this.dbGetAsync<{ adjudicated: number }>(`
        select count(*) as adjudicated
        from sheets
        where
          requires_adjudication = 1
          and (front_finished_adjudication_at is not null and back_finished_adjudication_at is not null)
      `),
    ]);
    return { adjudicated, remaining };
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  async exportCVRs(writeStream: Writable): Promise<void> {
    const electionDefinition = await this.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('no election configured');
    }

    const sql = `
      select
        sheets.id as id,
        batches.id as batchId,
        batches.label as batchLabel,
        front_interpretation_json as frontInterpretationJSON,
        back_interpretation_json as backInterpretationJSON,
        front_adjudication_json as frontAdjudicationJSON,
        back_adjudication_json as backAdjudicationJSON
      from sheets left join batches
      on sheets.batch_id = batches.id
      where
        (requires_adjudication = 0 or
        (front_finished_adjudication_at is not null and back_finished_adjudication_at is not null))
        and deleted_at is null
    `;
    for (const {
      id,
      batchId,
      batchLabel,
      frontInterpretationJSON,
      backInterpretationJSON,
      frontAdjudicationJSON,
      backAdjudicationJSON,
    } of await this.dbAllAsync<{
      id: string;
      batchId: string;
      batchLabel?: string;
      frontInterpretationJSON: string;
      backInterpretationJSON: string;
      frontAdjudicationJSON?: string;
      backAdjudicationJSON?: string;
    }>(sql)) {
      const frontInterpretation: PageInterpretation = JSON.parse(
        frontInterpretationJSON
      );
      const backInterpretation: PageInterpretation = JSON.parse(
        backInterpretationJSON
      );
      const frontAdjudications = frontAdjudicationJSON
        ? safeParseJSON(frontAdjudicationJSON, MarkAdjudicationsSchema).ok()
        : undefined;
      const backAdjudications = backAdjudicationJSON
        ? safeParseJSON(backAdjudicationJSON, MarkAdjudicationsSchema).ok()
        : undefined;
      const cvr = buildCastVoteRecord(
        id,
        batchId,
        batchLabel || '',
        frontInterpretation.type === 'InterpretedBmdPage'
          ? frontInterpretation.ballotId
          : backInterpretation.type === 'InterpretedBmdPage'
          ? backInterpretation.ballotId
          : id,
        electionDefinition.election,
        [
          {
            interpretation: frontInterpretation,
            contestIds:
              frontInterpretation.type === 'InterpretedHmpbPage' ||
              frontInterpretation.type === 'UninterpretedHmpbPage'
                ? await this.getContestIdsForMetadata(
                    frontInterpretation.metadata
                  )
                : undefined,
            markAdjudications: frontAdjudications,
          },
          {
            interpretation: backInterpretation,
            contestIds:
              backInterpretation.type === 'InterpretedHmpbPage' ||
              backInterpretation.type === 'UninterpretedHmpbPage'
                ? await this.getContestIdsForMetadata(
                    backInterpretation.metadata
                  )
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

  async addHmpbTemplate(
    pdf: Buffer,
    metadata: BallotMetadata,
    layouts: readonly SerializableBallotPageLayout[]
  ): Promise<string> {
    debug('storing HMPB template: %O', metadata);

    await this.dbRunAsync(
      `
      delete from hmpb_templates
      where json_extract(metadata_json, '$.locales.primary') = ?
      and json_extract(metadata_json, '$.locales.secondary') = ?
      and json_extract(metadata_json, '$.ballotStyleId') = ?
      and json_extract(metadata_json, '$.precinctId') = ?
      and json_extract(metadata_json, '$.isTestMode') = ?
      `,
      metadata.locales.primary,
      metadata.locales.secondary,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestMode
    );

    const id = uuid();
    await this.dbRunAsync(
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

  async getHmpbTemplates(): Promise<
    Array<[Buffer, SerializableBallotPageLayout[]]>
  > {
    const rows = await this.dbAllAsync<
      { id: string; pdf: Buffer; layoutsJSON: string; metadataJSON: string },
      []
    >(
      `
        select
          id,
          pdf,
          metadata_json as metadataJSON,
          layouts_json as layoutsJSON
        from hmpb_templates
        order by created_at asc
      `
    );
    const results: Array<[Buffer, SerializableBallotPageLayout[]]> = [];

    for (const { id, pdf, metadataJSON, layoutsJSON } of rows) {
      const metadata: BallotMetadata = JSON.parse(metadataJSON);
      debug('loading stored HMPB template id=%s: %O', id, metadata);
      const layouts: SerializableBallotPageLayout[] = JSON.parse(layoutsJSON);
      results.push([
        pdf,
        layouts.map((layout, i) => ({
          ...layout,
          ballotImage: {
            ...layout.ballotImage,
            metadata: {
              ...metadata,
              pageNumber: i + 1,
            },
          },
        })),
      ]);
    }

    return results;
  }

  async getBallotLayoutsForMetadata(
    metadata: BallotPageMetadata
  ): Promise<SerializableBallotPageLayout[]> {
    const rows = await this.dbAllAsync<{
      layoutsJSON: string;
      metadataJSON: string;
    }>(
      `
        select
          layouts_json as layoutsJSON,
          metadata_json as metadataJSON
        from hmpb_templates
      `
    );

    for (const row of rows) {
      const {
        locales,
        ballotStyleId,
        precinctId,
        isTestMode,
      }: BallotMetadata = JSON.parse(row.metadataJSON);

      if (
        metadata.locales.primary === locales.primary &&
        metadata.locales.secondary === locales.secondary &&
        metadata.ballotStyleId === ballotStyleId &&
        metadata.precinctId === precinctId &&
        metadata.isTestMode === isTestMode
      ) {
        return JSON.parse(row.layoutsJSON);
      }
    }

    throw new Error(
      `no ballot layouts found matching metadata: ${inspect(metadata)}`
    );
  }

  async getContestIdsForMetadata(
    metadata: BallotPageMetadata
  ): Promise<Array<AnyContest['id']>> {
    const electionDefinition = await this.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('no election configured');
    }

    const layouts = await this.getBallotLayoutsForMetadata(metadata);
    let contestOffset = 0;

    for (const layout of layouts) {
      if (layout.ballotImage.metadata.pageNumber === metadata.pageNumber) {
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
