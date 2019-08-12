//
// The scanner's entire exposed functionality, independent
// of the HTTP calls.
//

import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'

import { CVRCallbackParams, Election } from './types'
import {
  addBatch,
  addCVR,
  batchStatus,
  exportCVRs,
  init,
  finishBatch,
} from './store'
import interpretFile, { interpretBallotString } from './interpreter'

import execFile from './exec'

let manualBatchId: number | undefined

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
let watcher: chokidar.FSWatcher, election: Election | null

interface CVRCallbackWithBatchIDParams extends CVRCallbackParams {
  batchId: number
}

function cvrCallbackWithBatchId({
  batchId,
  ballotImagePath,
  cvr,
}: CVRCallbackWithBatchIDParams) {
  if (cvr) {
    addCVR(batchId, ballotImagePath, cvr)
  }

  // whether or not there is a CVR in that image, we move it to scanned
  const newBallotImagePath = path.join(
    scannedBallotImagesPath,
    path.basename(ballotImagePath)
  )
  if (fs.existsSync(ballotImagePath)) {
    fs.renameSync(ballotImagePath, newBallotImagePath)
  }
}

export function fileAdded(ballotImagePath: string) {
  if (!election) {
    return
  }

  // get the batch ID from the path
  const filename = path.basename(ballotImagePath)
  const batchIdMatch = filename.match(/-batch-([^-]*)-/)

  if (!batchIdMatch) {
    return
  }

  const batchId = parseInt(batchIdMatch[1])

  interpretFile({
    election,
    ballotImagePath,
    cvrCallback: ({ ballotImagePath, cvr }: CVRCallbackParams) => {
      cvrCallbackWithBatchId({ batchId, ballotImagePath, cvr })
    },
  })
}

export function configure(newElection: Election) {
  election = newElection

  // start watching the ballots
  watcher = chokidar.watch(ballotImagesPath, {
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 200,
    },
  })
  watcher.on('add', fileAdded)
}

function zeroPad(number: number, maxLength: number = 2): string {
  return number.toString().padStart(maxLength, '0')
}

function dateStamp(date: Date = new Date()): string {
  return `${zeroPad(date.getFullYear(), 4)}${zeroPad(
    date.getMonth() + 1
  )}${zeroPad(date.getDay())}_${zeroPad(date.getHours())}${zeroPad(
    date.getMinutes()
  )}${zeroPad(date.getSeconds())}`
}

export function doScan() {
  return new Promise((resolve, reject) => {
    if (!election) {
      reject(new Error('no election configuration'))
    } else {
      addBatch().then((batchId: number) => {
        // trigger a scan
        execFile(
          'scanimage',
          [
            '-d',
            'fujitsu',
            '--resolution',
            '300',
            '--format=jpeg',
            '--source="ADF Duplex"',
            `--batch=${ballotImagesPath}${dateStamp()}-batch-${batchId}-ballot-%04d.jpg`,
          ],
          err => {
            if (err) {
              // node couldn't execute the command
              return reject(new Error('problem scanning'))
            }

            // mark the batch done in a few seconds
            setTimeout(() => {
              finishBatch(batchId)
            }, 5000)
            resolve()
          }
        )
      })
    }
  })
}

export async function addManualBallot(ballotString: string) {
  if (!election) {
    return
  }

  if (!manualBatchId) {
    manualBatchId = await addBatch()
  }

  const cvr = interpretBallotString({
    election,
    ballotString,
  })

  if (cvr) {
    addCVR(manualBatchId!, 'manual-' + cvr['_serialNumber'], cvr)
  }
}

export async function doExport() {
  if (!election) {
    return ''
  }

  const outputStream = new streams.WritableStream()
  await exportCVRs(outputStream)
  return outputStream.toString()
}

export async function doZero() {
  await init(true)
  fsExtra.emptyDirSync(ballotImagesPath)
  fsExtra.emptyDirSync(scannedBallotImagesPath)
  manualBatchId = undefined
}

export async function getStatus() {
  const batches = await batchStatus()
  if (election) {
    return { electionHash: 'hashgoeshere', batches }
  } else {
    return { batches }
  }
}

export async function unconfigure() {
  await doZero()
  // eslint-disable-next-line no-null/no-null
  election = null
  if (watcher) {
    watcher.close()
  }
}
