//
// The scanner's entire exposed functionality, independent
// of the HTTP calls.
//

import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'

import { CVRCallbackParams, Election, CastVoteRecord } from './types'
import Store, { BatchInfo } from './store'
import interpretFile, { interpretBallotString } from './interpreter'
import execFile from './exec'

interface CVRCallbackWithBatchIDParams extends CVRCallbackParams {
  batchId: number
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

export const DefaultBallotImagesPath = path.join(
  __dirname,
  '..',
  'ballot-images/'
)
export const DefaultScannedBallotImagesPath = path.join(
  __dirname,
  '..',
  'scanned-ballot-images/'
)

export interface Options {
  store: Store
  ballotImagesPath: string
  scannedBallotImagesPath: string
}

export interface Scanner {
  addManualBallot(ballotString: string): Promise<void>
  configure(newElection: Election): void
  doExport(): Promise<string>
  doScan(): Promise<void>
  doZero(): Promise<void>
  getStatus(): Promise<{ batches: BatchInfo[]; electionHash?: string }>
  unconfigure(): Promise<void>
}

export default class SystemScanner implements Scanner {
  private election?: Election
  private watcher?: chokidar.FSWatcher
  private store: Store
  private manualBatchId?: number
  private onCVRAddedCallbacks: ((cvr: CastVoteRecord) => void)[] = []

  public readonly ballotImagesPath: string
  public readonly scannedBallotImagesPath: string

  public constructor({
    store,
    ballotImagesPath = DefaultBallotImagesPath,
    scannedBallotImagesPath = DefaultScannedBallotImagesPath,
  }: Partial<Exclude<Options, 'store'>> & { store: Store }) {
    this.store = store
    this.ballotImagesPath = ballotImagesPath
    this.scannedBallotImagesPath = scannedBallotImagesPath

    // make sure those directories exist
    for (const path of [ballotImagesPath, scannedBallotImagesPath]) {
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path)
      }
    }
  }

  public async addManualBallot(ballotString: string) {
    if (!this.election) {
      return
    }

    if (!this.manualBatchId) {
      this.manualBatchId = await this.store.addBatch()
    }

    const cvr = interpretBallotString({
      election: this.election,
      ballotString,
    })

    if (cvr) {
      this.addCVR(this.manualBatchId!, 'manual-' + cvr['_serialNumber'], cvr)
    }
  }

  public configure(newElection: Election) {
    this.election = newElection

    // start watching the ballots
    this.watcher = chokidar.watch(this.ballotImagesPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 200,
      },
    })
    this.watcher.on('add', path => this.fileAdded(path))
  }

  private fileAdded(ballotImagePath: string) {
    if (!this.election) {
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
      election: this.election,
      ballotImagePath,
      cvrCallback: ({ ballotImagePath, cvr }: CVRCallbackParams) => {
        this.cvrCallbackWithBatchId({ batchId, ballotImagePath, cvr })
      },
    })
  }

  private cvrCallbackWithBatchId({
    batchId,
    ballotImagePath,
    cvr,
  }: CVRCallbackWithBatchIDParams) {
    if (cvr) {
      this.addCVR(batchId, ballotImagePath, cvr)
    }

    // whether or not there is a CVR in that image, we move it to scanned
    const newBallotImagePath = path.join(
      this.scannedBallotImagesPath,
      path.basename(ballotImagePath)
    )
    if (fs.existsSync(ballotImagePath)) {
      fs.renameSync(ballotImagePath, newBallotImagePath)
    }
  }

  public addAddCVRCallback(callback: (cvr: CastVoteRecord) => void): void {
    this.onCVRAddedCallbacks.push(callback)
  }

  private addCVR(
    batchId: number,
    ballotImagePath: string,
    cvr: CastVoteRecord
  ): void {
    this.store.addCVR(batchId, ballotImagePath, cvr)
    for (const callback of this.onCVRAddedCallbacks) {
      try {
        callback(cvr)
      } catch {
        // ignore failed callbacks
      }
    }
  }

  public async doScan() {
    if (!this.election) {
      throw new Error('no election configuration')
    }

    const batchId = await this.store.addBatch()

    try {
      // trigger a scan
      await execFile('scanimage', [
        '-d',
        'fujitsu',
        '--resolution',
        '300',
        '--format=jpeg',
        '--source="ADF Duplex"',
        `--batch=${
          this.ballotImagesPath
        }${dateStamp()}-batch-${batchId}-ballot-%04d.jpg`,
      ])
    } catch {
      // node couldn't execute the command
      throw new Error('problem scanning')
    }

    // mark the batch done in a few seconds
    setTimeout(() => {
      this.store.finishBatch(batchId)
    }, 5000)
  }

  public async doExport() {
    if (!this.election) {
      return ''
    }

    const outputStream = new streams.WritableStream()
    await this.store.exportCVRs(outputStream)
    return outputStream.toString()
  }

  public async doZero() {
    await this.store.init(true)
    fsExtra.emptyDirSync(this.ballotImagesPath)
    fsExtra.emptyDirSync(this.scannedBallotImagesPath)
    this.manualBatchId = undefined
  }

  public async getStatus() {
    const batches = await this.store.batchStatus()
    if (this.election) {
      return { electionHash: 'hashgoeshere', batches }
    } else {
      return { batches }
    }
  }

  public async unconfigure() {
    await this.doZero()
    this.election = undefined
    if (this.watcher) {
      this.watcher.close()
    }
  }
}
