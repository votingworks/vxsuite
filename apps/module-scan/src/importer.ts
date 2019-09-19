import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'

import { CVRCallbackParams, Election, CastVoteRecord } from './types'
import Store, { BatchInfo } from './store'
import interpretFile, { interpretBallotString } from './interpreter'
import { Scanner } from './scanner'

interface CVRCallbackWithBatchIDParams extends CVRCallbackParams {
  batchId: number
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
  scanner: Scanner
  ballotImagesPath: string
  scannedBallotImagesPath: string
}

export interface Importer {
  addManualBallot(ballotString: string): Promise<void>
  configure(newElection: Election): void
  doExport(): Promise<string>
  doImport(): Promise<void>
  doZero(): Promise<void>
  getStatus(): Promise<{ batches: BatchInfo[]; electionHash?: string }>
  unconfigure(): Promise<void>
}

export default class SystemImporter implements Importer {
  private election?: Election
  private watcher?: chokidar.FSWatcher
  private store: Store
  private scanner: Scanner
  private manualBatchId?: number
  private onCVRAddedCallbacks: ((cvr: CastVoteRecord) => void)[] = []

  public readonly ballotImagesPath: string
  public readonly scannedBallotImagesPath: string

  public constructor({
    store,
    scanner,
    ballotImagesPath = DefaultBallotImagesPath,
    scannedBallotImagesPath = DefaultScannedBallotImagesPath,
  }: Partial<Exclude<Options, 'store' | 'scanner'>> & {
    store: Store
    scanner: Scanner
  }) {
    this.store = store
    this.scanner = scanner
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
    const batchIdMatch = filename.match(/batch-([^-]*)/)

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

  public async doImport() {
    if (!this.election) {
      throw new Error('no election configuration')
    }

    const batchId = await this.store.addBatch()

    try {
      // trigger a scan
      await this.scanner.scanInto(this.ballotImagesPath, `batch-${batchId}-`)
    } catch (err) {
      // node couldn't execute the command
      throw new Error(`problem scanning: ${err.message}`)
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
