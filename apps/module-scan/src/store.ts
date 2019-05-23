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

const dbRunAsync = function(db: sqlite3.Database, sql: string) {
  return new Promise((resolve, reject) => {
    db.run(sql, err => {
      if (err) {
        return reject(err)
      } else {
        resolve()
      }
    })
  })
}

const dbAllAsync = function(db: sqlite3.Database, sql: string) {
  return new Promise((resolve, reject) => {
    db.all(sql, [], (err, rows) => {
      if (err) {
        return reject(err)
      }

      resolve(rows)
    })
  })
}

export function init() {
  return new Promise((resolve, reject) => {
    if (!db) {
      db = new sqlite3.Database(isTesting ? ':memory:' : dbPath, err => {
        if (err) {
          return reject(err)
        }

        resolve()
      })
    }
  })
}

export function thisIsATest() {
  isTesting = true
}

export async function reset() {
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  await init()

  await dbRunAsync(
    db,
    'create table batches (id integer primary key autoincrement, startedAt datetime, endedAt datetime)'
  )
  await dbRunAsync(
    db,
    'create table CVRs (id integer primary key autoincrement, batch_id, filename text, cvr_json text)'
  )
}

export async function addBatch() {
  const result = new Promise<number>(function(resolve, reject) {
    db.run(
      "insert into batches (startedAt) values (strftime('%s','now'))",
      err => {
        if (err) {
          reject(err)
        } else {
          db.get('select last_insert_rowid() as row_id', (err, row) => {
            if (err) {
              reject(err)
            } else {
              resolve(parseInt(row.row_id))
            }
          })
        }
      }
    )
  })

  return result
}

export function finishBatch(batchId: number) {
  db.run(
    "update batches set endedAt = strftime('%s','now') where id = ?",
    batchId
  )
}

export function addCVR(batchId: number, filename: string, cvr: CastVoteRecord) {
  db.run(
    'insert into CVRs (batch_id, filename, cvr_json) values (?, ?, ?)',
    batchId,
    filename,
    JSON.stringify(cvr)
  )
}

export function countCVRs() {
  db.run('select count(*) from CVRs')
}

export async function batchStatus() {
  const sql =
    'select batches.id as id, startedAt, endedAt, count(*) as count from CVRs, batches where CVRS.batch_id = batches.id group by batches.id, batches.startedAt, batches.endedAt order by batches.startedAt desc'
  return dbAllAsync(db, sql)
}

export async function exportCVRs(writeStream: Writable) {
  const sql = 'select * from CVRs'
  return dbAllAsync(db, sql).then(rows => {
    // @ts-ignore
    writeStream.write(rows.map(row => row.cvr_json).join('\n'))
  })
}
