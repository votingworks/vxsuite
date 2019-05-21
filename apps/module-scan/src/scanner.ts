//
// The scanner's entire exposed functionality, independent
// of the HTTP calls.
//

import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import { CastVoteRecord, Election } from './types'
import { addCVR, exportCVRs } from './store'
import interpretFile from './interpreter'

import exec from './exec'

export const ballotImagesPath = path.join(__dirname, '..', 'ballot-images/')
export const scannedBallotImagesPath = path.join(
  __dirname,
  '..',
  'scanned-ballot-images/'
)
export const sampleBallotImagesPath = path.join(
  __dirname,
  '..',
  'sample-ballot-images/'
)

// make sure those directories exist
const allPaths = [ballotImagesPath, scannedBallotImagesPath]
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

function cvrCallback(ballotImagePath: string, cvr: CastVoteRecord) {
  // TODO: work on these status messages a bit more
  // https://github.com/votingworks/module-scan/issues/6
  setStatus('scanning', '1 ballot scanned')
  addCVR(ballotImagePath, cvr)
  const newBallotImagePath = path.join(
    scannedBallotImagesPath,
    path.basename(ballotImagePath)
  )
  fs.renameSync(ballotImagePath, newBallotImagePath)
}

export function fileAdded(ballotImagePath: string) {
  interpretFile({
    election,
    ballotImagePath,
    cvrCallback,
  })
}

export function configure(newElection: Election) {
  election = newElection

  // start watching the ballots
  watcher = chokidar.watch(ballotImagesPath, {
    persistent: true,
    awaitWriteFinish: true,
  })
  watcher.on('add', fileAdded)
}

export function doScan() {
  if (!election) {
    return
  }

  // trigger a scan
  exec(
    `scanimage -d fujitsu --resolution 300 --format=jpeg --batch=${ballotImagesPath}batch-$(date +%Y%m%d_%H%M%S)-ballot-%04d.jpg`,
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
