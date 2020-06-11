//
// The durable datastore for CVRs and configuration info.
//

import makeDebug from 'debug'
import * as sqlite3 from 'sqlite3'
import { promises as fs } from 'fs'
import { Writable } from 'stream'
import { Election } from '@votingworks/ballot-encoder'

import { CastVoteRecord, BatchInfo, BallotMetadata, BallotInfo } from './types'
import { MarkInfo } from './interpreter'

const debug = makeDebug('module-scan:store')

interface HmpbTemplatesColumns {
  id: number
  pdf: Buffer
  ballotStyleId: string
  precinctId: string
  isTestBallot: number // sqlite doesn't have "boolean", really
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
      'create table if not exists batches (id integer primary key autoincrement, startedAt datetime, endedAt datetime)'
    )
    await this.dbRunAsync(
      'create table if not exists ballots (id integer primary key autoincrement, batch_id integer references batches, filename text unique, marks_json text, cvr_json text)'
    )
    await this.dbRunAsync(
      'create table if not exists configs (key varchar(255) unique, value text)'
    )
    await this.dbRunAsync(
      'create table if not exists hmpb_templates (id integer primary key autoincrement, pdf blob, ballot_style_id varchar(255), precinct_id varchar(255), is_test_ballot boolean)'
    )
    await this.dbRunAsync(
      'create unique index if not exists hmpb_templates_1 on hmpb_templates (ballot_style_id, precinct_id, is_test_ballot)'
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
   * Adds a cast vote record to an existing batch.
   */
  public async addCVR(
    batchId: number,
    filename: string,
    cvr: CastVoteRecord,
    markInfo?: MarkInfo
  ): Promise<number> {
    try {
      await this.dbRunAsync(
        'insert into ballots (batch_id, filename, cvr_json, marks_json) values (?, ?, ?, ?)',
        batchId,
        filename,
        JSON.stringify(cvr),
        markInfo ? JSON.stringify(markInfo) : null
      )
      const { rowId } = await this.dbGetAsync(
        'select last_insert_rowid() as rowId'
      )
      return parseInt(rowId, 10)
    } catch (error) {
      // this catch effectively swallows an insert error
      // this might happen on duplicate insert, which happens
      // when chokidar sometimes notices a file twice.
      debug('addCVR failed: %s', error)
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

  /**
   * Gets the batch with id `batchId`.
   */
  public async getBatch(batchId: number): Promise<BallotInfo[]> {
    return (
      await this.dbAllAsync<
        {
          id: number
          filename: string
          marksJSON?: string
          cvrJSON?: string
        },
        [number]
      >(
        'select id, filename, marks_json as marksJSON, cvr_json as cvrJSON from ballots where batch_id = ?',
        batchId
      )
    ).map((row) => ({
      id: row.id,
      filename: row.filename,
      marks: row.marksJSON ? JSON.parse(row.marksJSON) : undefined,
      cvr: row.cvrJSON ? JSON.parse(row.cvrJSON) : undefined,
    }))
  }

  public async getBallotInfo(
    batchId: number,
    ballotId: number
  ): Promise<BallotInfo | undefined> {
    const row = await this.dbGetAsync<
      | {
          id: number
          filename: string
          marksJSON?: string
          cvrJSON?: string
        }
      | undefined,
      [number, number]
    >(
      'select id, filename, marks_json as marksJSON, cvr_json as cvrJSON from ballots where batch_id = ? and id = ?',
      batchId,
      ballotId
    )

    if (!row) {
      return
    }

    return {
      id: row.id,
      filename: row.filename,
      marks: row.marksJSON ? JSON.parse(row.marksJSON) : undefined,
      cvr: row.cvrJSON ? JSON.parse(row.cvrJSON) : undefined,
    }
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
    const rows = await this.dbAllAsync<{ cvrJSON: string }>(sql)
    writeStream.write(rows.map((row) => row.cvrJSON).join('\n'))
  }

  public async addHmpbTemplate(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<void> {
    debug('storing HMPB template: %O', metadata)

    await this.dbRunAsync(
      'delete from hmpb_templates where ballot_style_id = ? and precinct_id = ? and is_test_ballot = ?',
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )
    await this.dbRunAsync(
      'insert into hmpb_templates (pdf, ballot_style_id, precinct_id, is_test_ballot) values (?, ?, ?, ?)',
      pdf,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot
    )
  }

  public async getHmpbTemplates(): Promise<[Buffer, BallotMetadata][]> {
    const sql =
      'select id, pdf, ballot_style_id as ballotStyleId, precinct_id as precinctId, is_test_ballot as isTestBallot from hmpb_templates order by id asc'
    const rows = await this.dbAllAsync<HmpbTemplatesColumns>(sql)
    const results: [Buffer, BallotMetadata][] = []

    for (const { id, pdf, ...metadata } of rows) {
      debug('loading stored HMPB template id=%d: %O', id, metadata)
      results.push([
        pdf,
        { ...metadata, isTestBallot: metadata.isTestBallot !== 0 },
      ])
    }

    return results
  }
}
