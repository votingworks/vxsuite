import * as chokidar from 'chokidar'
import { createHash } from 'crypto'
import makeDebug from 'debug'
import * as jpeg from 'jpeg-js'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'
import { Election } from '@votingworks/ballot-encoder'
import { BallotPageLayout } from '@votingworks/hmpb-interpreter'

import { CastVoteRecord, BatchInfo, BallotMetadata } from './types'
import Store from './store'
import DefaultInterpreter, {
  Interpreter,
  interpretBallotData,
  InterpretedBallot,
} from './interpreter'
import { Scanner } from './scanner'
import pdfToImages from './util/pdfToImages'

const debug = makeDebug('module-scan:importer')

export interface Options {
  store: Store
  scanner: Scanner
  ballotImagesPath: string
  importedBallotImagesPath: string
  interpreter?: Interpreter
}

export interface Importer {
  addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]>
  addManualBallot(encodedBallot: Uint8Array): Promise<number | undefined>
  configure(newElection: Election): Promise<void>
  doExport(): Promise<string>
  doImport(): Promise<void>
  doZero(): Promise<void>
  importFile(
    batchId: number,
    ballotImagePath: string,
    ballotImageFile?: Buffer
  ): Promise<number | undefined>
  getStatus(): Promise<{ batches: BatchInfo[]; electionHash?: string }>
  restoreConfig(): Promise<void>
  setTestMode(testMode: boolean): Promise<void>
  unconfigure(): Promise<void>
}

export class HmpbInterpretationError extends Error {}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class SystemImporter implements Importer {
  private watcher?: chokidar.FSWatcher
  private store: Store
  private scanner: Scanner
  private interpreter: Interpreter
  private manualBatchId?: number
  private onCVRAddedCallbacks: ((cvr: CastVoteRecord) => void)[] = []

  private seenBallotImagePaths = new Set<string>()

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
    ballotImagesPath,
    importedBallotImagesPath,
    interpreter = new DefaultInterpreter(),
  }: Options) {
    this.store = store
    this.scanner = scanner
    this.interpreter = interpreter
    this.ballotImagesPath = ballotImagesPath
    this.importedBallotImagesPath = importedBallotImagesPath

    // make sure those directories exist
    for (const imagesPath of [ballotImagesPath, importedBallotImagesPath]) {
      if (!fs.existsSync(imagesPath)) {
        fs.mkdirSync(imagesPath)
      }
    }
  }

  public async addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]> {
    const election = await this.store.getElection()
    const result: BallotPageLayout[] = []

    if (!election) {
      throw new HmpbInterpretationError(
        `cannot add a HMPB template without a configured election`
      )
    }

    for await (const { page, pageCount, pageNumber } of pdfToImages(pdf, {
      scale: 2,
    })) {
      try {
        result.push(
          await this.interpreter.addHmpbTemplate(election, page, {
            ...metadata,
            pageNumber,
            pageCount,
          })
        )
      } catch (error) {
        throw new HmpbInterpretationError(
          `Ballot image on page ${pageNumber} could not be interpreted as a template: ${error}`
        )
      }
    }

    this.store.addHmpbTemplate(
      pdf,
      // remove ballot image for storage
      result.map((layout) => ({
        ...layout,
        ballotImage: {
          metadata: layout.ballotImage.metadata,
        },
      }))
    )

    return result
  }

  /**
   * Adds a ballot using the data that would have been read from a scan, i.e.
   * the data encoded by the QR code.
   */
  public async addManualBallot(
    encodedBallot: Uint8Array
  ): Promise<number | undefined> {
    const election = await this.store.getElection()

    if (!election) {
      return
    }

    if (!this.manualBatchId) {
      this.manualBatchId = await this.store.addBatch()
    }

    const cvr = interpretBallotData({
      election,
      encodedBallot,
    })

    if (cvr) {
      return await this.addBallot(
        this.manualBatchId!,
        `manual-${cvr._ballotId}`,
        {
          type: 'ManualBallot',
          cvr,
        }
      )
    }
  }

  /**
   * Sets the election information used to encode and decode ballots and begins
   * watching for scanned images to import.
   */
  public async configure(newElection: Election): Promise<void> {
    await this.store.setElection(newElection)

    // start watching the ballots
    this.watcher = chokidar.watch(this.ballotImagesPath, {
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 200,
      },
    })
    this.watcher.on('add', async (addedPath) => {
      try {
        await this.fileAdded(addedPath)
      } catch (error) {
        process.stderr.write(
          `unable to process file (${addedPath}): ${error.stack}\n`
        )
      }
    })
  }

  public async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode)
    await this.doZero()
    this.interpreter.setTestMode(testMode)
  }

  /**
   * Restore configuration from the store.
   */
  public async restoreConfig(): Promise<void> {
    const testMode = await this.store.getTestMode()
    debug('restoring test mode (%s)', testMode)
    this.interpreter.setTestMode(testMode)

    const election = await this.store.getElection()
    if (!election) {
      debug('skipping election restore because there is no stored election')
      return
    }

    debug('restoring election (%O)', election)
    await this.configure(election)

    for (const [pdf, layouts] of await this.store.getHmpbTemplates()) {
      debug('restoring ballot: %O', layouts)
      for await (const { page, pageCount, pageNumber } of pdfToImages(pdf, {
        scale: 2,
      })) {
        debug('restoring page %d/%d', pageNumber, pageCount)
        const layout = layouts[pageNumber - 1]

        await this.interpreter.addHmpbTemplate(election, {
          ...layout,
          ballotImage: {
            ...layout.ballotImage,
            imageData: page,
          },
        })
      }
    }
  }

  /**
   * Callback for chokidar to inform us that a new file was seen.
   */
  private async fileAdded(ballotImagePath: string): Promise<void> {
    debug('fileAdded %s', ballotImagePath)

    if (!(await this.store.getElection())) {
      return
    }

    // de-dupe because chokidar can't do it apparently
    if (this.seenBallotImagePaths.has(ballotImagePath)) {
      return
    }

    this.seenBallotImagePaths.add(ballotImagePath)

    // get the batch ID from the path
    const filename = path.basename(ballotImagePath)
    const batchIdMatch = filename.match(/batch-([^-]*)/)

    if (!batchIdMatch) {
      return
    }

    const batchId = parseInt(batchIdMatch[1], 10)

    await this.importFile(batchId, ballotImagePath, undefined)
  }

  public async importFile(
    batchId: number,
    ballotImagePath: string,
    ballotImageFile?: Buffer
  ): Promise<number | undefined> {
    const election = await this.store.getElection()

    if (!election) {
      return
    }

    if (!ballotImageFile) {
      ballotImageFile = await fsExtra.readFile(ballotImagePath)
    }

    const ballotImageHash = createHash('sha256')
      .update(ballotImageFile)
      .digest('hex')

    const interpreted = await this.interpreter.interpretFile({
      election,
      ballotImagePath,
      ballotImageFile,
    })
    if (!interpreted) {
      return
    }

    const cvr = 'cvr' in interpreted ? interpreted.cvr : undefined
    const normalizedImage =
      'normalizedImage' in interpreted ? interpreted.normalizedImage : undefined

    debug(
      'interpreted %s (%s): cvr=%O marks=%O metadata=%O',
      ballotImagePath,
      interpreted.type,
      cvr,
      'markInfo' in interpreted ? interpreted.markInfo : undefined,
      'metadata' in interpreted ? interpreted.metadata : undefined
    )

    if (cvr) {
      const ballotImagePathExt = path.extname(ballotImagePath)
      const importedBallotImagePath = path.join(
        this.importedBallotImagesPath,
        `${path.basename(
          ballotImagePath,
          ballotImagePathExt
        )}-${ballotImageHash}${ballotImagePathExt}`
      )

      const ballotId = await this.addBallot(
        batchId,
        importedBallotImagePath,
        interpreted
      )

      if (!ballotImageFile) {
        await fsExtra.unlink(ballotImagePath)
      }
      if (normalizedImage) {
        await fsExtra.writeFile(
          importedBallotImagePath,
          jpeg.encode(normalizedImage).data
        )
      }

      return ballotId
    } else {
      // eventually do something with files that don't have a CVR in them?
    }
  }

  /**
   * Register a callback to be called when a CVR entry is added.
   */
  public addAddCVRCallback(callback: (cvr: CastVoteRecord) => void): void {
    this.onCVRAddedCallbacks.push(callback)
  }

  /**
   * Add a ballot to the internal store.
   */
  private async addBallot(
    batchId: number,
    ballotImagePath: string,
    interpreted: InterpretedBallot
  ): Promise<number> {
    const ballotId = await this.store.addBallot(
      batchId,
      ballotImagePath,
      interpreted
    )

    for (const callback of this.onCVRAddedCallbacks) {
      try {
        if ('cvr' in interpreted) {
          callback(interpreted.cvr)
        }
      } catch {
        // ignore failed callbacks
      }
    }

    return ballotId
  }

  /**
   * Create a new batch and scan as many images as we can into it.
   */
  public async doImport(): Promise<void> {
    const election = await this.store.getElection()

    if (!election) {
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
  public async doExport(): Promise<string> {
    const election = await this.store.getElection()

    if (!election) {
      return ''
    }

    const outputStream = new streams.WritableStream()
    await this.store.exportCVRs(outputStream)
    return outputStream.toString()
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  public async doZero(): Promise<void> {
    await this.store.zero()
    fsExtra.emptyDirSync(this.ballotImagesPath)
    fsExtra.emptyDirSync(this.importedBallotImagesPath)
    this.manualBatchId = undefined
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  public async getStatus(): Promise<{
    electionHash?: string
    batches: BatchInfo[]
  }> {
    const election = await this.store.getElection()
    const batches = await this.store.batchStatus()
    if (election) {
      return { electionHash: 'hashgoeshere', batches }
    }
    return { batches }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure(): Promise<void> {
    await this.doZero()
    await this.store.setElection(undefined)
    if (this.watcher) {
      this.watcher.close()
    }
  }
}
