import * as chokidar from 'chokidar'
import { createHash } from 'crypto'
import makeDebug from 'debug'
import sharp, { Raw } from 'sharp'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'
import { Election } from '@votingworks/ballot-encoder'
import { BallotPageLayout } from '@votingworks/hmpb-interpreter'

import { BallotMetadata, ScanStatus } from './types'
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

  /**
   * Returns a promise that resolves once all currently-running imports finish.
   * If another import is triggered in the meantime, that import is not
   * included.
   */
  waitForImports(): Promise<void>

  getStatus(): Promise<ScanStatus>
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
  private onBallotAddedCallbacks: ((
    interpreted: InterpretedBallot
  ) => void)[] = []
  private timeouts: ReturnType<typeof setTimeout>[] = []
  private imports: Promise<void>[] = []

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
      debug('starting import task (%s)', addedPath)
      const importTask = this.fileAdded(addedPath)
      this.imports.push(importTask)
      try {
        await importTask
        debug('import task succeeded (%s)', addedPath)
      } catch (error) {
        debug('import task failed (%s): %s', addedPath, error.stack)
      } finally {
        this.imports = this.imports.filter((it) => it === importTask)
      }
    })
  }

  public async waitForImports(): Promise<void> {
    await Promise.allSettled(this.imports)
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

    const ballotImagePathExt = path.extname(ballotImagePath)
    const originalBallotImagePath = path.join(
      this.importedBallotImagesPath,
      `${path.basename(
        ballotImagePath,
        ballotImagePathExt
      )}-${ballotImageHash}-original${ballotImagePathExt}`
    )
    const normalizedBallotImagePath = path.join(
      this.importedBallotImagesPath,
      `${path.basename(
        ballotImagePath,
        ballotImagePathExt
      )}-${ballotImageHash}-normalized${ballotImagePathExt}`
    )

    const ballotId = await this.addBallot(
      batchId,
      originalBallotImagePath,
      normalizedBallotImagePath,
      interpreted
    )

    if (ballotImageFile) {
      await fsExtra.writeFile(originalBallotImagePath, ballotImageFile)
    } else {
      await fsExtra.move(ballotImagePath, originalBallotImagePath)
    }

    await fsExtra.writeFile(
      normalizedBallotImagePath,
      normalizedImage
        ? await sharp(Buffer.from(normalizedImage.data.buffer), {
            raw: {
              width: normalizedImage.width,
              height: normalizedImage.height,
              channels: (normalizedImage.data.length /
                (normalizedImage.width *
                  normalizedImage.height)) as Raw['channels'],
            },
          })
            .png()
            .toBuffer()
        : ballotImageFile
    )

    return ballotId
  }

  /**
   * Register a callback to be called when a CVR entry is added.
   */
  public addAddBallotCallback(
    callback: (interpreted: InterpretedBallot) => void
  ): void {
    this.onBallotAddedCallbacks.push(callback)
  }

  /**
   * Add a ballot to the internal store.
   */
  private async addBallot(
    batchId: number,
    originalBallotImagePath: string,
    normalizedBallotImagePath: string,
    interpreted: InterpretedBallot
  ): Promise<number> {
    const ballotId = await this.store.addBallot(
      batchId,
      originalBallotImagePath,
      normalizedBallotImagePath,
      interpreted
    )

    for (const callback of this.onBallotAddedCallbacks) {
      try {
        callback(interpreted)
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
      await this.scanner.scanInto({
        directory: this.ballotImagesPath,
        prefix: `batch-${batchId}-`,
      })
    } catch (err) {
      // node couldn't execute the command
      throw new Error(`problem scanning: ${err.message}`)
    }

    // mark the batch done in a few seconds
    const timeout = setTimeout(() => {
      this.store.finishBatch(batchId)
      this.timeouts = this.timeouts.filter((t) => t === timeout)
    }, 5000)
    this.timeouts.push(timeout)
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
  public async getStatus(): Promise<ScanStatus> {
    const election = await this.store.getElection()
    const batches = await this.store.batchStatus()
    const adjudication = await this.store.adjudicationStatus()
    if (election) {
      return { electionHash: 'hashgoeshere', batches, adjudication }
    }
    return { batches, adjudication }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure(): Promise<void> {
    await this.doZero()
    await this.store.init(true) // destroy all data
    if (this.watcher) {
      this.watcher.close()
    }
    for (const timeout of this.timeouts) {
      clearTimeout(timeout)
    }
  }
}
