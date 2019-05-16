
//
// The scanner's entire exposed functionality, independent
// of the HTTP calls.
//

import * as sqlite3 from 'sqlite3'
import {Election} from './types'
import {addBallot} from './store'
import * as interpreter from './interpreter'

export function configure(election:Election) {
  // start watching the ballots
  interpreter.init(election, "./ballots", addBallot)
}

export function doScan(db : sqlite3.Database) {
  console.log(db)  
}

export function doExport(db : sqlite3.Database) {
  console.log(db)  
}

export function doZero(db : sqlite3.Database) {
  console.log(db)  
}

export function getStatus() {
  return new Promise((resolve, _reject) => {
    resolve({numBallots:10})
  })
}
