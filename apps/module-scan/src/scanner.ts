//
// The scanner's entire exposed functionality, independent
// of the HTTP calls.
//

import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import { Ballot, Election } from './types'
import { addBallot, exportCVRs } from './store'
import interpretFile from './interpreter'

import exec from './exec'

export const ballotsPath = path.join(__dirname, '..', 'ballots/')
export const scannedBallotsPath = path.join(__dirname, '..', 'scanned-ballots/')
export const sampleBallotsPath = path.join(__dirname, '..', 'sample-ballots/')

// make sure those directories exist
const allPaths = [ballotsPath, scannedBallotsPath]
allPaths.forEach(path => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path)
  }
})

// keeping track of election
let watcher: chokidar.FSWatcher, election: Election

// keeping track of status
let status = '' // scanning, exporting, idle
let message = ''
let numBallotsScanned = 0

function setStatus(newStatus: string, newMessage: string) {
  status = newStatus
  message = newMessage
}

export function fileAdded(ballotPath: string) {
  interpretFile(election, ballotPath, (ballotPath: string, ballot: Ballot) => {
    // TODO: work on these status messages a bit more
    setStatus('scanning', '1 ballot scanned')
    addBallot(ballotPath, ballot)
    const newBallotPath = path.join(
      scannedBallotsPath,
      path.basename(ballotPath)
    )
    fs.renameSync(ballotPath, newBallotPath)
  })
}

export function configure(newElection: Election) {
  election = newElection

  // start watching the ballots
  watcher = chokidar.watch(ballotsPath, { persistent: true })
  watcher.on('add', fileAdded)
}

export function doScan() {
  if (!election) {
    return
  }

  // trigger a scan
  exec(
    'scanimage -d fujitsu --resolution 300 --format=jpeg --batch=ballots/batch-$(date +%Y%m%d_%H%M%S)-ballot-%04d.jpg > test.jpg',
    err => {
      if (err) {
        // node couldn't execute the command
        return
      }

      // the *entire* stdout and stderr (buffered)
    }
  )
}

export function doExport(callback: (arg0: string) => void) {
  if (!election) {
    return callback('')
  }

  const outputStream = new streams.WritableStream()
  exportCVRs(outputStream, function() {
    callback(outputStream.toString())
  })
}

export function doZero() {}

export function getStatus() {
  return { message, numBallotsScanned, status }
}

export function shutdown() {
  watcher.close()
}
