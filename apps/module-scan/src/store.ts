//
// The durable datastore for CVRs and configuration info.
//

import * as sqlite3 from 'sqlite3'
import fs from 'fs'
import { Writable } from 'stream'

import { CastVoteRecord, BatchInfo } from './types'

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
      return await this.dbCreate()
    } else {
      return this.db
    }
  }

  /**
   * Runs `sql` with interpolated data.
   *
   * @example
   *
   * await store.dbRunAsync('insert into muppets (name) values (?)', 'Kermit')
   */
  public async dbRunAsync<P extends unknown[]>(sql: string, ...params: P) {
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
  public dbGetAsync<T, P extends unknown[] = []>(
    sql: string,
    ...params: P
  ): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      const db = await this.getDb()
      db.get(sql, params, (err, row: T) => {
        if (err) {
          return reject(err)
        }

        resolve(row)
      })
    })
  }

  /**
   * Deletes the entire database, including its on-disk representation.
   */
  public async dbDestroy(): Promise<void> {
    const db = await this.getDb()
    return new Promise(resolve => {
      db.close(() => {
        if (fs.existsSync(this.dbPath)) {
          fs.unlinkSync(this.dbPath)
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
      const db = new sqlite3.Database(this.dbPath, err => {
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
      'create table if not exists CVRs (id integer primary key autoincrement, batch_id, filename text unique, cvr_json text)'
    )

    return this.db
  }

  /**
   * Initializes the database by destroying the existing one if needed.
   */
  public async init(resetDB = false) {
    if (this.db) {
      await this.dbDestroy()
    }

    if (resetDB) {
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath)
      }
    }

    await this.dbCreate()
  }

  /**
   * Adds a batch and returns its id.
   */
  public async addBatch() {
    await this.dbRunAsync(
      "insert into batches (startedAt) values (strftime('%s','now'))"
    )

    const { rowId } = await this.dbGetAsync(
      'select last_insert_rowid() as rowId'
    )
    return parseInt(rowId)
  }

  /**
   * Marks the batch with id `batchId` as finished.
   */
  public async finishBatch(batchId: number) {
    await this.dbRunAsync(
      "update batches set endedAt = strftime('%s','now') where id = ?",
      batchId
    )
  }

  /**
   * Adds a cast vote record to an existing batch.
   */
  public async addCVR(batchId: number, filename: string, cvr: CastVoteRecord) {
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
  public async deleteBatch(batchId: number) {
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
  public async batchStatus() {
    const sql =
      'select batches.id as id, startedAt, endedAt, count(*) as count from CVRs, batches where CVRS.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
    return this.dbAllAsync<BatchInfo>(sql)
  }

  /**
   * Exports all CVR JSON data to a stream.
   */
  public async exportCVRs(writeStream: Writable) {
    const sql = 'select cvr_json as cvrJSON from CVRs'
    const rows = await this.dbAllAsync<{ cvrJSON: string }>(sql)
    writeStream.write(rows.map(row => row.cvrJSON).join('\n'))
  }
}
