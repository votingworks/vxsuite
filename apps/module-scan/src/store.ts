//
// The durable datastore for CVRs and configuration info.
//

import { createHash } from 'crypto'
import makeDebug from 'debug'
import * as sqlite3 from 'sqlite3'
import { promises as fs } from 'fs'
import { Writable } from 'stream'
import { BallotPageMetadata } from '@votingworks/hmpb-interpreter'
import { Election } from '@votingworks/ballot-encoder'

import { CastVoteRecord, BatchInfo } from './types'
import { Blobs, FileSystemBlobs, MemoryBlobs } from './util/blobs'

const debug = makeDebug('module-scan:store')

interface HmpbTemplatesColumns {
  id: number
  filename: string
  width: number
  height: number
  ballotStyleId: string
  precinctId: string
  isTestBallot: number
  pageNumber: number
  pageCount: number
}

/**
 * Manages a data store for imported ballot image batches and cast vote records
 * interpreted by reading the ballots.
 */
export default class Store {
  private dbPath: string
  private files: Blobs
  private db?: sqlite3.Database

  /**
   * @param dbPath a file system path, or ":memory:" for an in-memory database
   * @param filesPath a file system path, or ":memory:" for an in-memory database
   */
  public constructor(dbPath: string, filesPath: string)
  public constructor(dbPath: string, files: Blobs)
  public constructor(dbPath: string, filesPathOrFiles: string | Blobs) {
    this.dbPath = dbPath
    this.files =
      typeof filesPathOrFiles === 'string'
        ? new FileSystemBlobs(filesPathOrFiles)
        : filesPathOrFiles
  }

  /**
   * Builds and returns a new store whose data is kept in memory.
   */
  public static async memoryStore(): Promise<Store> {
    const store = new Store(':memory:', new MemoryBlobs())
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
  public async dbAllAsync<T>(sql: string): Promise<T[]> {
    const db = await this.getDb()
    return new Promise((resolve, reject) => {
      db.all(sql, [], (err, rows: T[]) => {
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
          await fs.unlink(this.dbPath)
        } catch {
          // ignore failure
        }

        resolve()
      })
    })
  }

  /**
   * Creates the database including its tables.
   */
  public async dbCreate(): Promise<sqlite3.Database> {
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
      'create table if not exists CVRs (id integer primary key autoincrement, batch_id integer references batches, filename text unique, cvr_json text)'
    )
    await this.dbRunAsync(
      'create table if not exists hmpb_templates (id integer primary key autoincrement, filename text unique, width integer, height integer, ballot_style_id varchar(255), precinct_id varchar(255), is_test_ballot boolean, page_number integer, page_count integer)'
    )
    await this.dbRunAsync(
      'create unique index if not exists hmpb_templates_1 on hmpb_templates (ballot_style_id, precinct_id, is_test_ballot, page_number, page_count)'
    )

    return this.db
  }

  /**
   * Initializes the database by destroying the existing one if needed.
   */
  public async init(resetDB = false): Promise<void> {
    if (this.db) {
      await this.dbDestroy()
    }

    if (resetDB) {
      try {
        await fs.unlink(this.dbPath)
      } catch {
        // ignore failure
      }
    }

    await this.dbCreate()
  }

  /**
   * Gets the current election definition.
   */
  public async getElection(): Promise<Election | undefined> {
    const data = await this.files.get('election.json')
    return data ? JSON.parse(new TextDecoder().decode(data)) : undefined
  }

  /**
   * Sets the current election definition.
   */
  public async setElection(election?: Election): Promise<void> {
    if (election) {
      this.files.set(
        'election.json',
        Buffer.from(
          new TextEncoder().encode(JSON.stringify(election, undefined, 2))
        )
      )
    } else {
      this.files.delete('election.json')
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
    cvr: CastVoteRecord
  ): Promise<void> {
    try {
      await this.dbRunAsync(
        'insert into CVRs (batch_id, filename, cvr_json) values (?, ?, ?)',
        batchId,
        filename,
        JSON.stringify(cvr)
      )
    } catch {
      // this catch effectively swallows an insert error
      // this might happen on duplicate insert, which happens
      // when chokidar sometimes notices a file twice.
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
    await this.dbRunAsync('delete from CVRs where batch_id = ?', batchId)
    await this.dbRunAsync('delete from batches where id = ?', batchId)
    return count > 0
  }

  /**
   * Gets all batches, including their CVR count.
   */
  public async batchStatus(): Promise<BatchInfo[]> {
    const sql =
      'select batches.id as id, startedAt, endedAt, count(*) as count from CVRs, batches where CVRS.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
    return this.dbAllAsync(sql)
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  public async exportCVRs(writeStream: Writable): Promise<void> {
    const sql = 'select cvr_json as cvrJSON from CVRs'
    const rows = await this.dbAllAsync<{ cvrJSON: string }>(sql)
    writeStream.write(rows.map((row) => row.cvrJSON).join('\n'))
  }

  public async addHmpbTemplate(
    imageData: ImageData,
    metadata: BallotPageMetadata
  ): Promise<void> {
    const hash = createHash('sha256')
    hash.update(metadata.ballotStyleId)
    hash.update(metadata.precinctId)
    hash.update(metadata.isTestBallot ? 'test' : 'live')
    hash.update(metadata.pageNumber.toString())
    hash.update(metadata.pageCount.toString())

    const filename = hash.digest('hex')
    debug('storing HMPB template to %s: %O', filename, metadata)
    await this.files.set(filename, Buffer.from(imageData.data))

    await this.dbRunAsync(
      'delete from hmpb_templates where ballot_style_id = ? and precinct_id = ? and is_test_ballot = ? and page_number = ? and page_count = ?',
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot,
      metadata.pageNumber,
      metadata.pageCount
    )
    await this.dbRunAsync(
      'insert into hmpb_templates (filename, width, height, ballot_style_id, precinct_id, is_test_ballot, page_number, page_count) values (?, ?, ?, ?, ?, ?, ?, ?)',
      filename,
      imageData.width,
      imageData.height,
      metadata.ballotStyleId,
      metadata.precinctId,
      metadata.isTestBallot,
      metadata.pageNumber,
      metadata.pageCount
    )
  }

  public async getHmpbTemplates(): Promise<[ImageData, BallotPageMetadata][]> {
    const sql =
      'select id, filename, width, height, ballot_style_id as ballotStyleId, precinct_id as precinctId, is_test_ballot as isTestBallot, page_number as pageNumber, page_count as pageCount from hmpb_templates'
    const rows = await this.dbAllAsync<HmpbTemplatesColumns>(sql)
    const results: [ImageData, BallotPageMetadata][] = []

    for (const { id, filename, width, height, ...metadata } of rows) {
      debug(
        'loading stored HMPB template %d from %s: %O',
        id,
        filename,
        metadata
      )
      const data = Uint8ClampedArray.from((await this.files.get(filename))!)
      results.push([
        { data, width, height },
        { ...metadata, isTestBallot: metadata.isTestBallot !== 0 },
      ])
    }

    return results
  }
}
