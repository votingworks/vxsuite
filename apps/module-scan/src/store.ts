//
// The durable datastore for CVRs and configuration info.
//

import {
  Election,
  getBallotStyle,
  MarkThresholds,
} from '@votingworks/ballot-encoder'
import {
  BallotLocales,
  BallotMark,
  BallotPageMetadata,
  BallotTargetMark,
  Size,
} from '@votingworks/hmpb-interpreter'
import { createHash } from 'crypto'
import makeDebug from 'debug'
import { promises as fs } from 'fs'
import { join } from 'path'
import sharp from 'sharp'
import * as sqlite3 from 'sqlite3'
import { Writable } from 'stream'
import { v4 as uuid } from 'uuid'
import { MarkInfo, PageInterpretation } from './interpreter'
import {
  AdjudicationStatus,
  BatchInfo,
  CastVoteRecord,
  getMarkStatus,
  isMarginalMark,
  SerializableBallotPageLayout,
} from './types'
import {
  AdjudicationInfo,
  Contest,
  ContestLayout,
  MarksByContestId,
  ReviewBallot,
} from './types/ballot-review'
import allContestOptions from './util/allContestOptions'
import getBallotPageContests from './util/getBallotPageContests'
import { changesFromMarks, changesToCVR, mergeChanges } from './util/marks'

const debug = makeDebug('module-scan:store')

interface HmpbTemplatesColumns {
  id: number
  pdf: Buffer
  locales: string | null
  ballotStyleId: string
  precinctId: string
  isTestBallot: number // sqlite doesn't have "boolean", really
  layoutsJSON: string
}

export enum ConfigKey {
  Election = 'election',
  TestMode = 'testMode',
}

const SchemaPath = join(__dirname, '../schema.sql')

export const ALLOWED_CONFIG_KEYS: readonly string[] = Object.values(ConfigKey)

export const DefaultMarkThresholds: Readonly<MarkThresholds> = {
  marginal: 0.17,
  definite: 0.25,
}

/**
 * Manages a data store for imported ballot image batches and cast vote records
 * interpreted by reading the ballots.
 */
export default class Store {
  private dbPath: string
  private db?: sqlite3.Database

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   */
  private constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  public static async memoryStore(): Promise<Store> {
    const store = new Store(':memory:')
    await store.dbCreate()
    return store
  }

  /**
   * Builds and returns a new store at `dbPath`.
   */
  public static async fileStore(dbPath: string): Promise<Store> {
    const schemaDigestPath = `${dbPath}.digest`
    let schemaDigest: string | undefined
    try {
      schemaDigest = await fs.readFile(schemaDigestPath, 'utf-8')
    } catch {
      debug(
        'could not read %s, assuming the database needs to be created',
        schemaDigestPath
      )
    }
    const schemaSql = await fs.readFile(SchemaPath, 'utf-8')
    const newSchemaDigest = createHash('sha256').update(schemaSql).digest('hex')
    const shouldResetDatabase = newSchemaDigest !== schemaDigest

    if (shouldResetDatabase) {
      debug('database schema has changed')
      try {
        const backupPath = `${dbPath}.backup-${new Date()
          .toISOString()
          .replace(/[^\d]+/g, '-')
          .replace(/-+$/, '')}`
        await fs.rename(dbPath, backupPath)
        debug('backed up database to be reset to %s', backupPath)
      } catch {
        // ignore for now
      }
    }

    const store = new Store(dbPath)

    if (shouldResetDatabase) {
      debug('resetting database to updated schema')
      await store.reset()
      await fs.writeFile(schemaDigestPath, newSchemaDigest, 'utf-8')
    } else {
      debug('database schema appears to be up to date')
    }

    return store
  }

  /**
   * Gets the underlying sqlite3 database.
   */
  private async getDb(): Promise<sqlite3.Database> {
    if (!this.db) {
      return this.dbConnect()
    }
    return this.db
  }

  /**
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * await store.dbRunAsync('insert into muppets (name) values (?)', 'Kermit')
   */
  public async dbRunAsync<P extends unknown[]>(
    sql: string,
    ...params: P
  ): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      db.run(sql, ...params, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, params, err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
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
  public async dbExecAsync(sql: string): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      db.exec(sql, (err: unknown) => {
        if (err) {
          debug('failed to execute %s (%o): %s', sql, err)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Runs `sql` to fetch a list of rows.
   *
   * @example
   *
   * await store.dbAllAsync('select * from muppets')
   */
  public async dbAllAsync<T, P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<T[]> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err: unknown, rows: T[]) => {
        if (err) {
          reject(err)
        } else {
          resolve(rows)
        }
      })
    })
  }

  /**
   * Runs `sql` to fetch a single row.
   *
   * @example
   *
   * await store.dbGetAsync('select count(*) as count from muppets')
   */
  public async dbGetAsync<T, P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<T> {
    const db = await this.getDb()
    return new Promise<T>((resolve, reject) => {
      db.get(sql, params, (err: unknown, row: T) => {
        if (err) {
          reject(err)
        } else {
          resolve(row)
        }
      })
    })
  }

  /**
   * Deletes the entire database, including its on-disk representation.
   */
  public async dbDestroy(): Promise<void> {
    const db = await this.getDb()
    return new Promise((resolve) => {
      db.close(async () => {
        try {
          debug('deleting the database file at %s', this.dbPath)
          await fs.unlink(this.dbPath)
        } catch (error) {
          debug(
            'failed to delete database file %s: %s',
            this.dbPath,
            error.message
          )
        }

        resolve()
      })
    })
  }

  public async dbConnect(): Promise<sqlite3.Database> {
    debug('connecting to the database at %s', this.dbPath)
    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err: unknown) => {
        if (err) {
          reject(err)
        } else {
          resolve(db)
        }
      })
    })

    // Enforce foreign key constraints. This is not in schema.sql because that
    // only runs on db creation.
    await this.dbRunAsync('pragma foreign_keys = 1')

    return this.db
  }

  /**
   * Creates the database including its tables.
   */
  public async dbCreate(): Promise<sqlite3.Database> {
    debug('creating the database at %s', this.dbPath)
    const db = await this.dbConnect()
    await this.dbExecAsync(await fs.readFile(SchemaPath, 'utf-8'))
    return db
  }

  /**
   * Resets the database.
   */
  public async reset(): Promise<void> {
    if (this.db) {
      await this.dbDestroy()
    }

    await this.dbCreate()
  }

  /**
   * Gets the current election definition.
   */
  public async getElection(): Promise<Election | undefined> {
    const election: Election | undefined = await this.getConfig(
      ConfigKey.Election
    )

    if (election) {
      return {
        markThresholds: DefaultMarkThresholds,
        ...election,
      }
    }

    return undefined
  }

  /**
   * Sets the current election definition.
   */
  public async setElection(election?: Election): Promise<void> {
    await this.setConfig(ConfigKey.Election, election)
  }

  /**
   * Gets the current test mode setting value.
   */
  public async getTestMode(): Promise<boolean> {
    return await this.getConfig(ConfigKey.TestMode, false)
  }

  /**
   * Sets the current test mode setting value.
   */
  public async setTestMode(testMode: boolean): Promise<void> {
    await this.setConfig(ConfigKey.TestMode, testMode)
  }

  /**
   * Gets a config value by key.
   */
  private async getConfig<T>(key: ConfigKey): Promise<T | undefined>
  private async getConfig<T>(key: ConfigKey, defaultValue: T): Promise<T>
  private async getConfig<T>(
    key: ConfigKey,
    defaultValue?: T
  ): Promise<T | undefined> {
    debug('get config %s', key)

    const row = await this.dbGetAsync<{ value: string } | undefined, [string]>(
      'select value from configs where key = ?',
      key
    )

    if (typeof row === 'undefined') {
      return defaultValue
    }

    return JSON.parse(row.value)
  }

  /**
   * Sets the current election definition.
   */
  private async setConfig<T>(key: ConfigKey, value?: T): Promise<void> {
    debug('set config %s=%O', key, value)
    if (typeof value === 'undefined') {
      await this.dbRunAsync('delete from configs where key = ?', key)
    } else {
      await this.dbRunAsync(
        'insert or replace into configs (key, value) values (?, ?)',
        key,
        JSON.stringify(value)
      )
    }
  }

  /**
   * Adds a batch and returns its id.
   */
  public async addBatch(): Promise<string> {
    const id = uuid()
    await this.dbRunAsync('insert into batches (id) values (?)', id)
    return id
  }

  /**
   * Marks the batch with id `batchId` as finished.
   */
  public async finishBatch(batchId: string): Promise<void> {
    await this.dbRunAsync(
      'update batches set ended_at = current_timestamp where id = ?',
      batchId
    )
  }

  public async addBallotCard(batchId: string): Promise<string> {
    const id = uuid()
    await this.dbRunAsync(
      'insert into ballot_cards (id, batch_id) values (?, ?)',
      id,
      batchId
    )
    return id
  }

  /**
   * Adds a ballot to an existing batch.
   */
  public async addBallot(
    ballotId: string,
    batchId: string,
    originalFilename: string,
    normalizedFilename: string,
    interpretation: PageInterpretation
  ): Promise<string> {
    try {
      await this.dbRunAsync(
        `insert into ballots
          (id, batch_id, original_filename, normalized_filename, interpretation_json, requires_adjudication)
          values (?, ?, ?, ?, ?, ?)`,
        ballotId,
        batchId,
        originalFilename,
        normalizedFilename,
        JSON.stringify(interpretation),
        'adjudicationInfo' in interpretation
          ? interpretation.adjudicationInfo.requiresAdjudication
          : false
      )
    } catch (error) {
      debug(
        'ballot insert failed; maybe a duplicate? filename=%s',
        originalFilename
      )
    }

    const { id } = await this.dbGetAsync(
      'select id from ballots where original_filename = ?',
      originalFilename
    )
    return id
  }

  public async zero(): Promise<void> {
    await this.dbRunAsync('delete from batches')
  }

  public async getBallotFilenames(
    ballotId: string
  ): Promise<{ original: string; normalized: string } | undefined> {
    const row = await this.dbGetAsync<
      { original: string; normalized: string } | undefined,
      [string]
    >(
      `
      select
        original_filename as original,
        normalized_filename as normalized
      from
        ballots
      where
        id = ?
    `,
      ballotId
    )

    if (!row) {
      return
    }

    return row
  }

  public async getBallot(ballotId: string): Promise<ReviewBallot | undefined> {
    const election = await this.getElection()

    if (!election) {
      return
    }

    const row = await this.dbGetAsync<
      | {
          id: number
          originalFilename: string
          normalizedFilename: string
          marksJSON?: string
          adjudicationJSON?: string
          adjudicationInfoJSON?: string
          metadataJSON?: string
        }
      | undefined,
      [string]
    >(
      `
        select
          id,
          original_filename as originalFilename,
          normalized_filename as normalizedFilename,
          json_extract(interpretation_json, '$.markInfo') as marksJSON,
          json_extract(interpretation_json, '$.metadata') as metadataJSON,
          adjudication_json as adjudicationJSON,
          json_extract(interpretation_json, '$.adjudicationInfo') as adjudicationInfoJSON
        from ballots
        where id = ?
      `,
      ballotId
    )

    if (!row) {
      return
    }

    const marks: MarkInfo | undefined = row.marksJSON
      ? JSON.parse(row.marksJSON)
      : undefined
    const adjudication: MarksByContestId | undefined = row.adjudicationJSON
      ? JSON.parse(row.adjudicationJSON)
      : undefined
    const adjudicationInfo: AdjudicationInfo = row.adjudicationInfoJSON
      ? JSON.parse(row.adjudicationInfoJSON)
      : undefined
    const metadata: BallotPageMetadata | undefined = row.metadataJSON
      ? JSON.parse(row.metadataJSON)
      : undefined

    if (!metadata) {
      return
    }

    const hmpbTemplateRow = await this.dbGetAsync<
      { layoutsJSON: string },
      [string | null, string, string, boolean]
    >(
      `
      select
        layouts_json as layoutsJSON
      from hmpb_templates
      where
        locales = ?
        and ballot_style_id = ?
        and precinct_id = ?
        and is_test_ballot = ?
      `,
      this.serializeLocales(metadata.locales),
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )

    const layouts: SerializableBallotPageLayout[] = JSON.parse(
      hmpbTemplateRow.layoutsJSON
    )
    const layout = layouts[metadata.pageNumber - 1]
    const ballotStyle = getBallotStyle({
      ballotStyleId: metadata.ballotStyleId,
      election,
    })

    if (!ballotStyle) {
      return
    }

    const ballotSize = await (async (): Promise<Size> => {
      if (marks) {
        return marks.ballotSize
      }

      const { width, height } = await sharp(row.normalizedFilename).metadata()

      if (!width || !height) {
        throw new Error(
          `unable to read image size from ${row.normalizedFilename}`
        )
      }

      return { width, height }
    })()

    const ballot: ReviewBallot['ballot'] = {
      url: `/scan/hmpb/ballot/${ballotId}`,
      image: {
        url: `/scan/hmpb/ballot/${ballotId}/image`,
        ...ballotSize,
      },
    }

    const ballotPageContests = getBallotPageContests(
      election,
      metadata,
      layouts
    )

    const contests: Contest[] = ballotPageContests.map((contestDefinition) => {
      return {
        id: contestDefinition.id,
        title: contestDefinition.title,
        options: [...allContestOptions(contestDefinition)],
      }
    })

    if (!marks) {
      return {
        type: 'ReviewUninterpretableHmpbBallot',
        contests,
        ballot,
      }
    }

    debug('overlaying ballot adjudication: %O', adjudication)

    const overlay = marks.marks.reduce<MarksByContestId>(
      (marks, mark) =>
        mark.type === 'stray'
          ? marks
          : {
              ...marks,
              [mark.contest.id]: {
                ...marks[mark.contest.id],
                [typeof mark.option === 'string'
                  ? mark.option
                  : mark.option.id]:
                  adjudication?.[mark.contest.id]?.[
                    typeof mark.option === 'string'
                      ? mark.option
                      : mark.option.id
                  ] ?? getMarkStatus(mark, election.markThresholds!),
              },
            },
      {}
    )

    debug('overlay results: %O', overlay)

    const contestLayouts: ContestLayout[] = ballotPageContests.map(
      (_contestDefinition, contestIndex) => {
        const contestLayout = layout.contests[contestIndex]
        return {
          bounds: contestLayout.bounds,
          options: contestLayout.options.map((option) => ({
            bounds: option.bounds,
          })),
        }
      }
    )

    return {
      type: 'ReviewMarginalMarksBallot',
      ballot,
      marks: overlay,
      contests,
      layout: contestLayouts,
      adjudicationInfo,
    }
  }

  public async getNextReviewBallot(): Promise<ReviewBallot | undefined> {
    const row = await this.dbGetAsync<{ id: string } | undefined, [boolean]>(
      `
      select id
      from ballots
      where requires_adjudication = ?
      order by created_at asc
      limit 1
    `,
      true
    )

    if (row) {
      debug('got next review ballot requiring adjudication (id=%d)', row.id)
      return this.getBallot(row.id)
    } else {
      debug('no review ballots requiring adjudication')
    }
  }

  public async saveBallotAdjudication(
    ballotId: string,
    change: MarksByContestId
  ): Promise<boolean> {
    const { markThresholds } = (await this.getElection()) ?? {}
    const row = await this.dbGetAsync<
      { adjudicationJSON?: string; marksJSON?: string } | undefined,
      [string]
    >(
      `
      select
        adjudication_json as adjudicationJSON,
        json_extract(interpretation_json, '$.markInfo') as marksJSON
      from ballots
      where id = ?
    `,
      ballotId
    )

    if (!row || !markThresholds) {
      return false
    }

    const marks: readonly BallotMark[] | undefined = row.marksJSON
      ? JSON.parse(row.marksJSON).marks
      : undefined
    const newAdjudication = mergeChanges(
      marks ? changesFromMarks(marks, markThresholds) : {},
      row.adjudicationJSON ? JSON.parse(row.adjudicationJSON) : {},
      change
    )
    const unadjudicatedMarks =
      marks
        ?.filter((mark): mark is BallotTargetMark =>
          isMarginalMark(mark, markThresholds)
        )
        .filter(
          (mark) =>
            !newAdjudication[mark.contest.id]?.[
              typeof mark.option === 'string' ? mark.option : mark.option.id
            ]
        ) ?? []

    debug(
      'saving adjudication changes for ballot %d: %O',
      ballotId,
      newAdjudication
    )
    debug(
      'adjudication complete for ballot %d? %s',
      ballotId,
      unadjudicatedMarks.length === 0
    )

    await this.dbRunAsync(
      `update ballots
        set
          adjudication_json = ?
        , requires_adjudication = ?
      where id = ?`,
      JSON.stringify(newAdjudication, undefined, 2),
      unadjudicatedMarks.length > 0,
      ballotId
    )

    return true
  }

  /**
   * Deletes the batch with id `batchId`.
   */
  public async deleteBatch(batchId: number): Promise<boolean> {
    const { count }: { count: number } = await this.dbGetAsync(
      'select count(*) as count from batches where id = ?',
      batchId
    )
    await this.dbRunAsync('delete from batches where id = ?', batchId)
    return count > 0
  }

  /**
   * Gets all batches, including their CVR count.
   */
  public async batchStatus(): Promise<BatchInfo[]> {
    return this.dbAllAsync(`
      select
        batches.id as id,
        started_at || 'Z' as startedAt,
        (case when ended_at is null then ended_at else ended_at || 'Z' end) as endedAt,
        count(*) as count
      from
        ballots,
        batches
      where
        ballots.batch_id = batches.id
      group by
        batches.id,
        batches.started_at,
        batches.ended_at
      order by
        batches.started_at desc
    `)
  }

  /**
   * Gets adjudication status.
   */
  public async adjudicationStatus(): Promise<AdjudicationStatus> {
    const [{ remaining }, { adjudicated }] = await Promise.all([
      this.dbGetAsync<{ remaining: number }, [boolean]>(
        `
        select count(*) as remaining
        from ballots
        where
          requires_adjudication = ?
          and adjudication_json is null`,
        true
      ),
      this.dbGetAsync<{ adjudicated: number }, [boolean]>(
        `
        select count(*) as adjudicated
        from ballots
        where
          requires_adjudication = ?
          and adjudication_json is not null`,
        false
      ),
    ])
    return { adjudicated, remaining }
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  public async exportCVRs(writeStream: Writable): Promise<void> {
    const sql = `
      select
        id,
        json_extract(interpretation_json, '$.cvr') as cvrJSON,
        json_extract(interpretation_json, '$.metadata') as metadataJSON,
        adjudication_json as adjudicationJSON
      from ballots
      where requires_adjudication = ?
    `
    for (const {
      id,
      cvrJSON,
      adjudicationJSON,
      metadataJSON,
    } of await this.dbAllAsync<
      {
        id: number
        cvrJSON?: string
        adjudicationJSON?: string
        metadataJSON?: string
      },
      [boolean]
    >(sql, false)) {
      const cvr: CastVoteRecord | undefined = cvrJSON
        ? JSON.parse(cvrJSON)
        : undefined
      const changes: MarksByContestId | undefined = adjudicationJSON
        ? JSON.parse(adjudicationJSON)
        : undefined
      const metadata: BallotPageMetadata | undefined = metadataJSON
        ? JSON.parse(metadataJSON)
        : undefined
      const finalCVR =
        changes && metadata ? changesToCVR(changes, metadata, cvr) : cvr

      if (!finalCVR) {
        debug(
          'export skipping ballot %d because a CVR could not be generated',
          id
        )
      } else {
        writeStream.write(JSON.stringify(finalCVR))
        writeStream.write('\n')
      }
    }
  }

  public async addHmpbTemplate(
    pdf: Buffer,
    layouts: readonly SerializableBallotPageLayout[]
  ): Promise<string> {
    const { metadata } = layouts[0].ballotImage

    debug('storing HMPB template: %O', metadata)

    await this.dbRunAsync(
      'delete from hmpb_templates where locales = ? and ballot_style_id = ? and precinct_id = ? and is_test_ballot = ?',
      this.serializeLocales(metadata.locales),
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )

    const id = uuid()
    await this.dbRunAsync(
      `
      insert into hmpb_templates (
        id,
        pdf,
        locales,
        ballot_style_id,
        precinct_id,
        is_test_ballot,
        layouts_json
      ) values (
        ?, ?, ?, ?, ?, ?, ?
      )
      `,
      id,
      pdf,
      this.serializeLocales(metadata.locales),
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot,
      JSON.stringify(layouts, undefined, 2)
    )
    return id
  }

  public async getHmpbTemplates(): Promise<
    [Buffer, SerializableBallotPageLayout[]][]
  > {
    const sql = `
        select
          id,
          pdf,
          locales,
          ballot_style_id as ballotStyleId,
          precinct_id as precinctId,
          is_test_ballot as isTestBallot,
          layouts_json as layoutsJSON
        from hmpb_templates
        order by created_at asc
      `
    const rows = await this.dbAllAsync<HmpbTemplatesColumns>(sql)
    const results: [Buffer, SerializableBallotPageLayout[]][] = []

    for (const { id, pdf, layoutsJSON, ...metadata } of rows) {
      debug('loading stored HMPB template id=%d: %O', id, metadata)
      const layouts: SerializableBallotPageLayout[] = JSON.parse(layoutsJSON)
      results.push([
        pdf,
        layouts.map((layout, i) => ({
          ...layout,
          ballotImage: {
            metadata: {
              ...metadata,
              locales: this.parseLocales(metadata.locales),
              isTestBallot: metadata.isTestBallot !== 0,
              pageNumber: i + 1,
              pageCount: layouts.length,
            },
          },
        })),
      ])
    }

    return results
  }

  private serializeLocales(locales?: BallotLocales): string | null {
    if (!locales) {
      return null
    }

    if (!locales.secondary) {
      return locales.primary
    }

    return `${locales.primary},${locales.secondary}`
  }

  private parseLocales(value: string | null): BallotLocales | undefined {
    if (!value) {
      return undefined
    }

    const [primary, secondary] = value.split(',')
    return { primary, secondary }
  }
}
