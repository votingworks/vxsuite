//
// The durable datastore for CVRs and configuration info.
//

import {
  Candidate,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/ballot-encoder'
import {
  BallotLocales,
  BallotPageMetadata,
  BallotTargetMark,
} from '@votingworks/hmpb-interpreter'
import { strict as assert } from 'assert'
import makeDebug from 'debug'
import { promises as fs } from 'fs'
import * as sqlite3 from 'sqlite3'
import { Writable } from 'stream'
import { MarkInfo, InterpretedBallot } from './interpreter'
import {
  BatchInfo,
  CastVoteRecord,
  getMarkStatus,
  isMarginalMark,
  SerializableBallotPageLayout,
} from './types'
import {
  CandidateContestOption,
  Contest,
  ContestOption,
  MarksByContestId,
  ReviewBallot,
  YesNoContestOption,
} from './types/ballot-review'
import applyChangesToMarks from './util/applyChangesToMarks'

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
        filename text unique,
        marks_json text,
        cvr_json text,
        metadata_json text,
        adjudication_json text,
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
    return await this.getConfig('election')
  }

  /**
   * Sets the current election definition.
   */
  public async setElection(election?: Election): Promise<void> {
    await this.setConfig('election', election)
  }

  /**
   * Gets the current test mode setting value.
   */
  public async getTestMode(): Promise<boolean> {
    return await this.getConfig('testMode', false)
  }

  /**
   * Sets the current test mode setting value.
   */
  public async setTestMode(testMode: boolean): Promise<void> {
    await this.setConfig('testMode', testMode)
  }

  /**
   * Gets a config value by key.
   */
  private async getConfig<T>(key: string): Promise<T | undefined>
  // eslint-disable-next-line no-dupe-class-members
  private async getConfig<T>(key: string, defaultValue: T): Promise<T>
  // eslint-disable-next-line no-dupe-class-members
  private async getConfig<T>(
    key: string,
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
  private async setConfig<T>(key: string, value?: T): Promise<void> {
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
    filename: string,
    interpreted: InterpretedBallot
  ): Promise<number> {
    try {
      const cvr = 'cvr' in interpreted ? interpreted.cvr : undefined
      const markInfo =
        'markInfo' in interpreted ? interpreted.markInfo : undefined
      const metadata =
        'metadata' in interpreted ? interpreted.metadata : undefined
      const requiresAdjudication =
        markInfo?.marks.some((mark) => isMarginalMark(mark)) ?? false

      await this.dbRunAsync(
        `insert into ballots
          (batch_id, filename, cvr_json, marks_json, metadata_json, requires_adjudication)
          values (?, ?, ?, ?, ?, ?)`,
        batchId,
        filename,
        JSON.stringify(cvr),
        markInfo ? JSON.stringify(markInfo, undefined, 2) : null,
        metadata ? JSON.stringify(metadata, undefined, 2) : null,
        requiresAdjudication
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
        'select id from ballots where filename = ?',
        filename
      )
      return parseInt(id, 10)
    }
  }

  public async zero(): Promise<void> {
    await this.dbRunAsync('delete from ballots')
    await this.dbRunAsync('delete from batches')
  }

  public async getBallotFilename(
    ballotId: number
  ): Promise<string | undefined> {
    const row = await this.dbGetAsync<
      { filename: string } | undefined,
      [number]
    >('select filename from ballots where id = ?', ballotId)

    if (!row) {
      return
    }

    return row.filename
  }

  public async getBallot(ballotId: number): Promise<ReviewBallot | undefined> {
    const election = await this.getElection()

    if (!election) {
      return
    }

    const row = await this.dbGetAsync<
      | {
          id: number
          filename: string
          marksJSON?: string
          adjudicationJSON?: string
          cvrJSON?: string
          metadataJSON?: string
        }
      | undefined,
      [number]
    >(
      `
        select
          id,
          filename,
          marks_json as marksJSON,
          adjudication_json as adjudicationJSON,
          cvr_json as cvrJSON,
          metadata_json as metadataJSON
        from ballots
        where id = ?
      `,
      ballotId
    )

    if (!row) {
      return
    }

    const cvr: CastVoteRecord | undefined = row.cvrJSON
      ? JSON.parse(row.cvrJSON)
      : undefined
    const marks: MarkInfo | undefined = row.marksJSON
      ? JSON.parse(row.marksJSON)
      : undefined
    const adjudication: MarksByContestId | undefined = row.adjudicationJSON
      ? JSON.parse(row.adjudicationJSON)
      : undefined
    const metadata: BallotPageMetadata | undefined = row.metadataJSON
      ? JSON.parse(row.metadataJSON)
      : undefined

    if (!cvr || !marks || !metadata) {
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

    const ballot: ReviewBallot['ballot'] = {
      url: `/scan/hmpb/ballot/${ballotId}`,
      image: {
        url: `/scan/hmpb/ballot/${ballotId}/image`,
        width: marks.ballotSize.width,
        height: marks.ballotSize.height,
      },
    }

    const contestOffset = layouts
      .slice(0, metadata.pageNumber - 1)
      .reduce((sum, { contests }) => sum + contests.length, 0)
    debug('determined contest offset to be %d', contestOffset)
    const contestDefinitions = getContests({ ballotStyle, election }).slice(
      contestOffset,
      contestOffset + layout.contests.length
    )

    assert.equal(contestDefinitions.length, layout.contests.length)

    const contests: Contest[] = contestDefinitions.map(
      (contestDefinition, contestIndex) => {
        const contestLayout = layout.contests[contestIndex]
        const contestMarksOffset = layout.contests
          .slice(0, contestIndex)
          .reduce((sum, contest) => sum + contest.options.length, 0)
        const contestMarks = marks.marks.slice(
          contestMarksOffset,
          contestMarksOffset + contestLayout.options.length
        )
        const options: ContestOption[] =
          contestDefinition.type === 'candidate'
            ? contestMarks.map<CandidateContestOption>((mark, markIndex) => {
                assert.notEqual(mark.type, 'stray')

                const candidate: Candidate | undefined =
                  contestDefinition.candidates[markIndex]

                return {
                  type: 'candidate',
                  id: candidate?.id ?? '__write-in',
                  name: candidate?.name ?? 'Write-In',
                  bounds: contestLayout.options[markIndex].bounds,
                }
              })
            : contestMarks.map<YesNoContestOption>((mark, markIndex) => {
                assert.notEqual(mark.type, 'stray')

                return {
                  type: 'yesno',
                  id: markIndex === 0 ? 'yes' : 'no',
                  name: markIndex === 0 ? 'Yes' : 'No',
                  bounds: contestLayout.options[markIndex].bounds,
                }
              })

        return {
          id: contestDefinition.id,
          title: contestDefinition.title,
          bounds: contestLayout.bounds,
          options,
        }
      }
    )

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
                  ] ?? getMarkStatus(mark),
              },
            },
      {}
    )

    debug('overlay results: %O', overlay)

    return {
      ballot,
      marks: overlay,
      contests,
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

    if (!row || !row.marksJSON) {
      return false
    }

    const marks: MarkInfo = JSON.parse(row.marksJSON)
    const newAdjudication = applyChangesToMarks(
      marks.marks,
      row.adjudicationJSON ? JSON.parse(row.adjudicationJSON) : {},
      change
    )
    const unadjudicatedMarks = marks.marks
      .filter((mark): mark is BallotTargetMark => isMarginalMark(mark))
      .filter(
        (mark) =>
          !newAdjudication[mark.contest.id]?.[
            typeof mark.option === 'string' ? mark.option : mark.option.id
          ]
      )

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
    const sql =
      'select batches.id as id, startedAt, endedAt, count(*) as count from ballots, batches where ballots.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
    return this.dbAllAsync(sql)
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  public async exportCVRs(writeStream: Writable): Promise<void> {
    const sql =
      'select cvr_json as cvrJSON from ballots where cvr_json is not null'
    for (const { cvrJSON } of await this.dbAllAsync<{ cvrJSON: string }>(sql)) {
      writeStream.write(cvrJSON)
      writeStream.write('\n')
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
