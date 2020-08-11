//
// The durable datastore for CVRs and configuration info.
//

import {
  AdjudicationReason,
  Contests,
  Election,
  getBallotStyle,
} from '@votingworks/ballot-encoder'
import {
  BallotLocales,
  BallotMark,
  BallotPageMetadata,
  BallotTargetMark,
  Size,
} from '@votingworks/hmpb-interpreter'
import makeDebug from 'debug'
import { promises as fs } from 'fs'
import sharp from 'sharp'
import * as sqlite3 from 'sqlite3'
import { Writable } from 'stream'
import { InterpretedBallot, MarkInfo } from './interpreter'
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
  MarkStatus,
  ReviewBallot,
} from './types/ballot-review'
import allContestOptions from './util/allContestOptions'
import ballotAdjudicationReasons, {
  adjudicationReasonDescription,
} from './util/ballotAdjudicationReasons'
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

export const ALLOWED_CONFIG_KEYS: readonly string[] = Object.values(ConfigKey)

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
  public constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  public static async memoryStore(): Promise<Store> {
    const store = new Store(':memory:')
    await store.init()
    return store
  }

  /**
   * Gets the underlying sqlite3 database, creating it if needed.
   */
  private async getDb(): Promise<sqlite3.Database> {
    if (!this.db) {
      return this.dbCreate()
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
      db.run(sql, ...params, (err: Error) => {
        if (err) {
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
      db.all(sql, params, (err, rows: T[]) => {
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
      db.get(sql, params, (err, row: T) => {
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

  /**
   * Creates the database including its tables.
   */
  public async dbCreate(): Promise<sqlite3.Database> {
    debug('creating the database at %s', this.dbPath)
    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve(db)
        }
      })
    })

    await this.dbRunAsync(
      `create table if not exists batches (
        id integer primary key autoincrement,
        startedAt datetime,
        endedAt datetime
      )`
    )
    await this.dbRunAsync(
      `create table if not exists ballots (
        id integer primary key autoincrement,
        batch_id integer references batches,
        original_filename text unique,
        normalized_filename text unique,
        marks_json text,
        cvr_json text,
        metadata_json text,
        adjudication_json text,
        adjudication_info_json text,
        requires_adjudication boolean
      )`
    )
    await this.dbRunAsync(
      `create table if not exists configs (
        key varchar(255) unique,
        value text
      )`
    )
    await this.dbRunAsync(
      `create table if not exists hmpb_templates (
        id integer primary key autoincrement,
        pdf blob,
        locales varchar(255),
        ballot_style_id varchar(255),
        precinct_id varchar(255),
        is_test_ballot boolean,
        layouts_json text
      )`
    )
    await this.dbRunAsync(
      `create unique index if not exists hmpb_templates_idx on hmpb_templates (
        locales,
        ballot_style_id,
        precinct_id,
        is_test_ballot
      )`
    )

    return this.db
  }

  /**
   * Initializes the database by destroying the existing one if needed.
   */
  public async init(resetDB = false): Promise<void> {
    if (resetDB || !this.db) {
      if (this.db) {
        await this.dbDestroy()
      }

      await this.dbCreate()
    }
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
        markThresholds: { marginal: 0.17, definite: 0.25 },
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
  public async addBatch(): Promise<number> {
    await this.dbRunAsync(
      "insert into batches (startedAt) values (strftime('%s','now'))"
    )

    const { rowId } = await this.dbGetAsync(
      'select last_insert_rowid() as rowId'
    )
    return parseInt(rowId, 10)
  }

  /**
   * Marks the batch with id `batchId` as finished.
   */
  public async finishBatch(batchId: number): Promise<void> {
    await this.dbRunAsync(
      "update batches set endedAt = strftime('%s','now') where id = ?",
      batchId
    )
  }

  /**
   * Adds a ballot to an existing batch.
   */
  public async addBallot(
    batchId: number,
    originalFilename: string,
    normalizedFilename: string,
    interpreted: InterpretedBallot
  ): Promise<number> {
    try {
      const cvr = 'cvr' in interpreted ? interpreted.cvr : undefined
      const markInfo =
        'markInfo' in interpreted ? interpreted.markInfo : undefined
      const metadata =
        'metadata' in interpreted ? interpreted.metadata : undefined

      const canBeAdjudicated =
        interpreted.type === 'InterpretedHmpbBallot' ||
        interpreted.type === 'UninterpretedHmpbBallot'
      let requiresAdjudication = false
      let adjudicationInfo: AdjudicationInfo | undefined

      if (canBeAdjudicated) {
        const contests = markInfo?.marks.reduce<Contests>(
          (contests, { contest }) =>
            contest && contests.every(({ id }) => contest.id !== id)
              ? [...contests, contest]
              : contests,
          []
        )
        const election = await this.getElection()
        adjudicationInfo = {
          enabledReasons: election?.adjudicationReasons ?? [
            AdjudicationReason.UninterpretableBallot,
            AdjudicationReason.MarginalMark,
          ],
          allReasonInfos: [
            ...ballotAdjudicationReasons(contests, {
              optionMarkStatus: (contestId, optionId) => {
                if (markInfo?.marks) {
                  for (const mark of markInfo.marks) {
                    if (
                      mark.type === 'stray' ||
                      mark.contest.id !== contestId
                    ) {
                      continue
                    }

                    if (
                      (mark.type === 'candidate' &&
                        mark.option.id === optionId) ||
                      (mark.type === 'yesno' && mark.option === optionId)
                    ) {
                      return getMarkStatus(mark, election?.markThresholds!)
                    }
                  }
                }

                return MarkStatus.Unmarked
              },
            }),
          ],
        }

        for (const reason of adjudicationInfo.allReasonInfos) {
          if (adjudicationInfo.enabledReasons.includes(reason.type)) {
            requiresAdjudication = true
            debug(
              'Adjudication required for reason: %s',
              adjudicationReasonDescription(reason)
            )
          } else {
            debug(
              'Adjudication reason ignored by configuration: %s',
              adjudicationReasonDescription(reason)
            )
          }
        }
      }

      await this.dbRunAsync(
        `insert into ballots
          (batch_id, original_filename, normalized_filename, cvr_json, marks_json, metadata_json, requires_adjudication, adjudication_info_json)
          values (?, ?, ?, ?, ?, ?, ?, ?)`,
        batchId,
        originalFilename,
        normalizedFilename,
        JSON.stringify(cvr),
        markInfo ? JSON.stringify(markInfo, undefined, 2) : null,
        metadata ? JSON.stringify(metadata, undefined, 2) : null,
        requiresAdjudication,
        adjudicationInfo ? JSON.stringify(adjudicationInfo, undefined, 2) : null
      )
      const { rowId } = await this.dbGetAsync(
        'select last_insert_rowid() as rowId'
      )
      return parseInt(rowId, 10)
    } catch (error) {
      // this catch effectively swallows an insert error
      // this might happen on duplicate insert, which happens
      // when chokidar sometimes notices a file twice.
      debug('addBallot failed: %s', error)
      const { id } = await this.dbGetAsync(
        'select id from ballots where original_filename = ?',
        originalFilename
      )
      return parseInt(id, 10)
    }
  }

  public async zero(): Promise<void> {
    await this.dbRunAsync('delete from ballots')
    await this.dbRunAsync('delete from batches')
  }

  public async getBallotFilenames(
    ballotId: number
  ): Promise<{ original: string; normalized: string } | undefined> {
    const row = await this.dbGetAsync<
      { original: string; normalized: string } | undefined,
      [number]
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

  public async getBallot(ballotId: number): Promise<ReviewBallot | undefined> {
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
      [number]
    >(
      `
        select
          id,
          original_filename as originalFilename,
          normalized_filename as normalizedFilename,
          marks_json as marksJSON,
          adjudication_json as adjudicationJSON,
          adjudication_info_json as adjudicationInfoJSON,
          metadata_json as metadataJSON
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
    const row = await this.dbGetAsync<{ id: number } | undefined, [boolean]>(
      `
      select id
      from ballots
      where requires_adjudication = ?
      order by id asc
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
    ballotId: number,
    change: MarksByContestId
  ): Promise<boolean> {
    const { markThresholds } = (await this.getElection()) ?? {}
    const row = await this.dbGetAsync<
      { adjudicationJSON?: string; marksJSON?: string } | undefined,
      [number]
    >(
      `
      select
        adjudication_json as adjudicationJSON,
        marks_json as marksJSON
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
    await this.dbRunAsync('delete from ballots where batch_id = ?', batchId)
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
        startedAt,
        endedAt,
        count(*) as count
      from
        ballots,
        batches
      where
        ballots.batch_id = batches.id
      group by
        batches.id,
        batches.startedAt,
        batches.endedAt
      order by
        batches.startedAt desc
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
    const sql =
      'select id, cvr_json as cvrJSON, adjudication_json as adjudicationJSON, metadata_json as metadataJSON from ballots where requires_adjudication = ?'
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
  ): Promise<void> {
    const { metadata } = layouts[0].ballotImage

    debug('storing HMPB template: %O', metadata)

    await this.dbRunAsync(
      'delete from hmpb_templates where locales = ? and ballot_style_id = ? and precinct_id = ? and is_test_ballot = ?',
      this.serializeLocales(metadata.locales),
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )
    await this.dbRunAsync(
      'insert into hmpb_templates (pdf, locales, ballot_style_id, precinct_id, is_test_ballot, layouts_json) values (?, ?, ?, ?, ?, ?)',
      pdf,
      this.serializeLocales(metadata.locales),
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot,
      JSON.stringify(layouts, undefined, 2)
    )
  }

  public async getHmpbTemplates(): Promise<
    [Buffer, SerializableBallotPageLayout[]][]
  > {
    const sql =
      'select id, pdf, locales, ballot_style_id as ballotStyleId, precinct_id as precinctId, is_test_ballot as isTestBallot, layouts_json as layoutsJSON from hmpb_templates order by id asc'
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
