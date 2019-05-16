
//
// The durable datastore for CVRs and configuration info.
//

import * as sqlite3 from 'sqlite3'
import fs from 'fs'

import {Ballot} from './types'

const dbPath = "./cvrs.db"

let db : sqlite3.Database

export function getDB() {
  init()
  return db
}

export function init() {
  if (!db) {
    db = new sqlite3.Database(dbPath)
  }
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
  db.run("create table election (election_json text)")
  db.run("create table CVRs (filename text, cvr_json text)")
}

export function addBallot(filename: string, ballot: Ballot) {
  db.run("insert into CVRs values (?,?)", filename, JSON.stringify(ballot))
}

export function countBallots() {
  db.run("select count(*) from CVRs")
}
