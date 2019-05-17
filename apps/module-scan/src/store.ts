//
// The durable datastore for CVRs and configuration info.
//

import * as sqlite3 from 'sqlite3'
import fs from 'fs'
import path from 'path'
import { Writable } from 'stream'

import { Ballot } from './types'

const dbPath = path.join(__dirname, '..', 'cvrs.db')

let db: sqlite3.Database

let isTesting = false

export function init() {
  if (!db) {
    db = new sqlite3.Database(isTesting ? ':memory:' : dbPath)
  }
}

export function thisIsATest() {
  isTesting = true
}

export function reset() {
  if (db) {
    db.close()
  }

  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath)
  }

  init()

  // create data model
  db.run('create table election (election_json text)')
  db.run('create table CVRs (filename text, cvr_json text)')
}

export function addBallot(filename: string, ballot: Ballot) {
  db.run('insert into CVRs values (?,?)', filename, JSON.stringify(ballot))
}

export function countBallots() {
  db.run('select count(*) from CVRs')
}

export function exportCVRs(writeStream: Writable, callback: () => void) {
  const sql = 'select * from CVRs'
  db.all(sql, [], (err, rows) => {
    if (err) {
      return
    }

    writeStream.write(rows.map(row => row.cvr_json).join('\n'))

    callback()
  })
}
