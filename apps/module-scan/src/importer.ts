import * as chokidar from 'chokidar'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'

import { CVRCallbackParams, Election, CastVoteRecord, BatchInfo } from './types'
import Store from './store'
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
export const DefaultImportedBallotImagesPath = path.join(
  __dirname,
  '..',
  'imported-ballot-images/'
)

export interface Options {
  store: Store
  scanner: Scanner
  ballotImagesPath: string
  importedBallotImagesPath: string
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

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class SystemImporter implements Importer {
  private election?: Election
  private watcher?: chokidar.FSWatcher
  private store: Store
  private scanner: Scanner
  private manualBatchId?: number
  private onCVRAddedCallbacks: ((cvr: CastVoteRecord) => void)[] = []

  public readonly ballotImagesPath: string
  public readonly importedBallotImagesPath: string

  /**
   * @param param0 options for this importer
   * @param param0.store a data store to track scanned ballot images
   * @param param0.scanner a source of ballot images
   * @param param0.ballotImagesPath a directory to scan ballot images into
   * @param param0.scannedBallotImagesPath a directory to keep imported ballot images
   */
  public constructor({
    store,
    scanner,
    ballotImagesPath = DefaultBallotImagesPath,
    importedBallotImagesPath = DefaultImportedBallotImagesPath,
  }: Partial<Exclude<Options, 'store' | 'scanner'>> & {
    store: Store
    scanner: Scanner
  }) {
    this.store = store
    this.scanner = scanner
    this.ballotImagesPath = ballotImagesPath
    this.importedBallotImagesPath = importedBallotImagesPath

    // make sure those directories exist
    for (const path of [ballotImagesPath, importedBallotImagesPath]) {
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path)
      }
    }
  }

  /**
   * Adds a ballot using the data that would have been read from a scan, i.e.
   * the data encoded by the QR code.
   */
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

  /**
   * Sets the election information used to encode and decode ballots and begins
   * watching for scanned images to import.
   */
  public async configure(newElection: Election) {
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

  /**
   * Callback for chokidar to inform us that a new file was seen.
   */
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
      this.importedBallotImagesPath,
      path.basename(ballotImagePath)
    )
    if (fs.existsSync(ballotImagePath)) {
      fs.renameSync(ballotImagePath, newBallotImagePath)
    }
  }

  /**
   * Register a callback to be called when a CVR entry is added.
   */
  public addAddCVRCallback(callback: (cvr: CastVoteRecord) => void): void {
    this.onCVRAddedCallbacks.push(callback)
  }

  /**
   * Add a CVR entry to the internal store.
   */
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

  /**
   * Create a new batch and scan as many images as we can into it.
   */
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

  /**
   * Export the current CVRs to a string.
   */
  public async doExport() {
    if (!this.election) {
      return ''
    }

    const outputStream = new streams.WritableStream()
    await this.store.exportCVRs(outputStream)
    return outputStream.toString()
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  public async doZero() {
    await this.store.init(true)
    fsExtra.emptyDirSync(this.ballotImagesPath)
    fsExtra.emptyDirSync(this.importedBallotImagesPath)
    this.manualBatchId = undefined
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  public async getStatus() {
    const batches = await this.store.batchStatus()
    if (this.election) {
      return { electionHash: 'hashgoeshere', batches }
    } else {
      return { batches }
    }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure() {
    await this.doZero()
    this.election = undefined
    if (this.watcher) {
      this.watcher.close()
    }
  }
}
