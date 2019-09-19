//
// The durable datastore for CVRs and configuration info.
//

import * as sqlite3 from 'sqlite3'
import fs from 'fs'
import { Writable } from 'stream'

import { CastVoteRecord } from './types'

export default class Store {
  private dbPath: string
  private db?: sqlite3.Database

  public constructor(dbPath: string, db?: sqlite3.Database) {
    this.dbPath = dbPath
    this.db = db
  }

  public static async memoryStore(): Promise<Store> {
    const store = new Store(':memory:')
    await store.init()
    return store
  }

  private async getDb(): Promise<sqlite3.Database> {
    if (!this.db) {
      return await this.dbCreate()
    } else {
      return this.db
    }
  }

  public dbRunAsync<P extends unknown[]>(sql: string, ...params: P) {
    return new Promise(async (resolve, reject) => {
      const db = await this.getDb()
      db.run(sql, ...params, (err: Error) => {
        if (err) {
          return reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  public dbAllAsync<T>(sql: string): Promise<T[]> {
    return new Promise(async (resolve, reject) => {
      const db = await this.getDb()
      db.all(sql, [], (err, rows: T[]) => {
        if (err) {
          return reject(err)
        }

        resolve(rows)
      })
    })
  }

  public dbGetAsync<T>(sql: string): Promise<T> {
    return new Promise<T>(async (resolve, reject) => {
      const db = await this.getDb()
      db.get(sql, (err, row: T) => {
        if (err) {
          return reject(err)
        }

        resolve(row)
      })
    })
  }

  public dbDestroy(): Promise<void> {
    return new Promise(async resolve => {
      const db = await this.getDb()
      db.close(() => {
        if (fs.existsSync(this.dbPath)) {
          fs.unlinkSync(this.dbPath)
        }

        resolve()
      })
    })
  }

  public async dbCreate(): Promise<sqlite3.Database> {
    this.db = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, err => {
        if (err) {
          return reject(err)
        }

        resolve(db)
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

  public async addBatch() {
    await this.dbRunAsync(
      "insert into batches (startedAt) values (strftime('%s','now'))"
    )

    const { rowId } = await this.dbGetAsync(
      'select last_insert_rowid() as rowId'
    )
    return parseInt(rowId)
  }

  public async finishBatch(batchId: number) {
    await this.dbRunAsync(
      "update batches set endedAt = strftime('%s','now') where id = ?",
      batchId
    )
  }

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

  public async batchStatus() {
    const sql =
      'select batches.id as id, startedAt, endedAt, count(*) as count from CVRs, batches where CVRS.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
    return this.dbAllAsync<BatchInfo>(sql)
  }

  public async exportCVRs(writeStream: Writable) {
    const sql = 'select cvr_json as cvrJSON from CVRs'
    const rows = await this.dbAllAsync<{ cvrJSON: string }>(sql)
    writeStream.write(rows.map(row => row.cvrJSON).join('\n'))
  }
}

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}
