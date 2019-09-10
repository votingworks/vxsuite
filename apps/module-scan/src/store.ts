//
// The durable datastore for CVRs and configuration info.
//

import * as sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'
import { Writable } from 'stream'

import { CastVoteRecord } from './types'

const dbPath = path.join(__dirname, '..', 'cvrs.db')

let db: sqlite3.Database

let isTesting = false

const dbRunAsync = function<P extends unknown[]>(
  db: sqlite3.Database,
  sql: string,
  ...params: P
) {
  return new Promise((resolve, reject) => {
    db.run(sql, ...params, (err: Error) => {
      if (err) {
        return reject(err)
      } else {
        resolve()
      }
    })
  })
}

const dbAllAsync = function<T>(
  db: sqlite3.Database,
  sql: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows: T[]) => {
      if (err) {
        return reject(err)
      }

      resolve(rows)
    })
  })
}

const dbGetAsync = function<T>(db: sqlite3.Database, sql: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    db.get(sql, (err, row: T) => {
      if (err) {
        return reject(err)
      }

      resolve(row)
    })
  })
}

const dbDestroy = function(
  db: sqlite3.Database,
  dbPath: string
): Promise<void> {
  return new Promise(resolve => {
    db.close(() => {
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath)
      }

      resolve()
    })
  })
}

const dbCreate = async function(dbPath: string): Promise<sqlite3.Database> {
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, err => {
      if (err) {
        return reject(err)
      }

      resolve(db)
    })
  })

  await dbRunAsync(
    db,
    'create table if not exists batches (id integer primary key autoincrement, startedAt datetime, endedAt datetime)'
  )
  await dbRunAsync(
    db,
    'create table if not exists CVRs (id integer primary key autoincrement, batch_id, filename text unique, cvr_json text)'
  )

  return db
}

export async function init(resetDB = false) {
  if (db) {
    await dbDestroy(db, dbPath)
  }

  if (resetDB) {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  }

  db = await dbCreate(isTesting ? ':memory:' : dbPath)
}

export function thisIsATest() {
  isTesting = true
}

export async function addBatch() {
  await dbRunAsync(
    db,
    "insert into batches (startedAt) values (strftime('%s','now'))"
  )

  const { rowId } = await dbGetAsync(db, 'select last_insert_rowid() as rowId')
  return parseInt(rowId)
}

export async function finishBatch(batchId: number) {
  await dbRunAsync(
    db,
    "update batches set endedAt = strftime('%s','now') where id = ?",
    batchId
  )
}

export async function addCVR(
  batchId: number,
  filename: string,
  cvr: CastVoteRecord
) {
  try {
    await dbRunAsync(
      db,
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

export interface BatchInfo {
  id: number
  startedAt: Date
  endedAt: Date
  count: number
}

export async function batchStatus() {
  const sql =
    'select batches.id as id, startedAt, endedAt, count(*) as count from CVRs, batches where CVRS.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
  return dbAllAsync<BatchInfo[]>(db, sql)
}

export async function exportCVRs(writeStream: Writable) {
  const sql = 'select cvr_json as cvrJSON from CVRs'
  const rows = await dbAllAsync<{ cvrJSON: string }>(db, sql)
  writeStream.write(rows.map(row => row.cvrJSON).join('\n'))
}
