import { BallotPageLayout, Interpreter } from '@votingworks/hmpb-interpreter'
import makeDebug from 'debug'
import * as fs from 'fs'
import * as fsExtra from 'fs-extra'
import * as streams from 'memory-streams'
import { join } from 'path'
import { sync as rimraf } from 'rimraf'
import sharp, { Raw } from 'sharp'
import { v4 as uuid } from 'uuid'
import { PageInterpretation } from './interpreter'
import { Scanner } from './scanner'
import Store from './store'
import {
  BallotMetadata,
  ElectionDefinition,
  ScanStatus,
  SheetOf,
  Side,
} from './types'
import pdfToImages from './util/pdfToImages'
import { call, Input, InterpretOutput, Output } from './workers/interpret'
import { inlinePool, WorkerPool } from './workers/pool'

const debug = makeDebug('module-scan:importer')

export const sleep = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface Options {
  store: Store
  scanner: Scanner
  scannedImagesPath: string
  importedImagesPath: string
  interpreterWorkerPoolProvider?: () => WorkerPool<Input, Output>
}

export interface Importer {
  addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]>
  doneHmpbTemplates(): Promise<void>
  configure(electionDefinition: ElectionDefinition): Promise<void>
  doExport(): Promise<string>
  startImport(): Promise<string>
  continueImport(override?: boolean): Promise<void>
  waitForEndOfBatchOrScanningPause(): Promise<void>
  doZero(): Promise<void>
  importFile(
    batchId: string,
    frontImagePath: string,
    backImagePath: string
  ): Promise<string>
  getStatus(): Promise<ScanStatus>
  restoreConfig(): Promise<void>
  setTestMode(testMode: boolean): Promise<void>
  unconfigure(): Promise<void>
}

export class HmpbInterpretationError extends Error {}

export async function saveImages(
  imagePath: string,
  originalImagePath: string,
  normalizedImagePath: string,
  normalizedImage?: ImageData
): Promise<{
  original: string
  normalized: string
}> {
  await fsExtra.copy(imagePath, originalImagePath)

  if (normalizedImage) {
    debug('about to write normalized ballot image to %s', normalizedImagePath)
    await fsExtra.writeFile(
      normalizedImagePath,
      await sharp(Buffer.from(normalizedImage.data.buffer), {
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
    )
    debug('wrote normalized ballot image to %s', normalizedImagePath)
    return { original: originalImagePath, normalized: normalizedImagePath }
  }

  return { original: originalImagePath, normalized: originalImagePath }
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class SystemImporter implements Importer {
  private store: Store
  private scanner: Scanner
  private sheetGenerator: AsyncGenerator<SheetOf<string>> | undefined
  private batchId: string | undefined
  private interpreterWorkerPool?: WorkerPool<Input, Output>
  private interpreterWorkerPoolProvider: () => WorkerPool<Input, Output>
  private interpreterReady = true

  public readonly scannedImagesPath: string
  public readonly importedImagesPath: string

  /**
   * @param param0 options for this importer
   * @param param0.store a data store to track scanned ballot images
   * @param param0.scanner a source of ballot images
   * @param param0.scannedImagesPath a directory to scan ballot images into
   * @param param0.importedImagesPath a directory to keep imported ballot images
   */
  public constructor({
    store,
    scanner,
    scannedImagesPath,
    importedImagesPath,
    interpreterWorkerPoolProvider = (): WorkerPool<Input, Output> =>
      inlinePool<Input, Output>(call),
  }: Options) {
    this.store = store
    this.scanner = scanner
    this.scannedImagesPath = scannedImagesPath
    this.importedImagesPath = importedImagesPath
    this.interpreterWorkerPoolProvider = interpreterWorkerPoolProvider

    // make sure those directories exist
    for (const imagesPath of [scannedImagesPath, importedImagesPath]) {
      if (!fs.existsSync(imagesPath)) {
        fs.mkdirSync(imagesPath)
      }
    }
  }

  private invalidateInterpreterConfig(): void {
    this.interpreterReady = false
    this.interpreterWorkerPool?.stop()
    this.interpreterWorkerPool = undefined
  }

  private async getInterpreterWorkerPool(): Promise<WorkerPool<Input, Output>> {
    if (!this.interpreterWorkerPool) {
      this.interpreterWorkerPool = this.interpreterWorkerPoolProvider()
      this.interpreterWorkerPool.start()
      await this.interpreterWorkerPool.callAll({
        action: 'configure',
        dbPath: this.store.dbPath,
      })
      this.interpreterReady = true
    }
    return this.interpreterWorkerPool
  }

  public async addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]> {
    const electionDefinition = await this.store.getElectionDefinition()
    const result: BallotPageLayout[] = []

    if (!electionDefinition) {
      throw new HmpbInterpretationError(
        `cannot add a HMPB template without a configured election`
      )
    }

    const interpreter = new Interpreter(electionDefinition.election)
    for await (const { page, pageNumber } of pdfToImages(pdf, {
      scale: 2,
    })) {
      try {
        result.push(
          await interpreter.interpretTemplate(page, {
            ...metadata,
            pageNumber,
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
      result[0].ballotImage.metadata,
      // remove ballot image for storage
      result.map((layout) => ({
        ...layout,
        ballotImage: {
          metadata: layout.ballotImage.metadata,
        },
      }))
    )

    this.invalidateInterpreterConfig()

    return result
  }

  /**
   * Tell the importer that we have all the templates
   */
  public async doneHmpbTemplates(): Promise<void> {
    await this.getInterpreterWorkerPool()
  }

  /**
   * Sets the election information used to encode and decode ballots.
   */
  public async configure(
    electionDefinition: ElectionDefinition
  ): Promise<void> {
    await this.store.setElection(electionDefinition)
  }

  public async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode)
    await this.doZero()
    await this.store.setTestMode(testMode)
    await this.restoreConfig()
  }

  /**
   * Restore configuration from the store.
   */
  public async restoreConfig(): Promise<void> {
    this.invalidateInterpreterConfig()
    await this.getInterpreterWorkerPool()
  }

  private async sheetAdded(
    paths: SheetOf<string>,
    batchId: string
  ): Promise<string> {
    const start = Date.now()
    try {
      debug('sheetAdded %o batchId=%s STARTING', paths, batchId)
      return await this.importFile(batchId, paths[0], paths[1])
    } finally {
      const end = Date.now()
      debug(
        'sheetAdded %o batchId=%s FINISHED in %dms',
        paths,
        batchId,
        Math.round(end - start)
      )
    }
  }

  public async importFile(
    batchId: string,
    frontImagePath: string,
    backImagePath: string
  ): Promise<string> {
    let sheetId = uuid()
    const interpreterWorkerPool = await this.getInterpreterWorkerPool()
    const frontWorkerPromise = interpreterWorkerPool.call({
      action: 'interpret',
      dbPath: this.store.dbPath,
      imagePath: frontImagePath,
      sheetId,
      importedImagesPath: this.importedImagesPath,
    })
    const backWorkerPromise = interpreterWorkerPool.call({
      action: 'interpret',
      dbPath: this.store.dbPath,
      imagePath: backImagePath,
      sheetId,
      importedImagesPath: this.importedImagesPath,
    })

    const frontWorkerOutput = (await frontWorkerPromise) as InterpretOutput
    const backWorkerOutput = (await backWorkerPromise) as InterpretOutput

    debug(
      'interpreted %s (%s): %O',
      frontImagePath,
      frontWorkerOutput.interpretation.type,
      frontWorkerOutput.interpretation
    )
    debug(
      'interpreted %s (%s): %O',
      backImagePath,
      backWorkerOutput.interpretation.type,
      backWorkerOutput.interpretation
    )

    sheetId = await this.addSheet(
      batchId,
      frontWorkerOutput.originalImagePath,
      frontWorkerOutput.normalizedImagePath,
      frontWorkerOutput.interpretation,
      backWorkerOutput.originalImagePath,
      backWorkerOutput.normalizedImagePath,
      backWorkerOutput.interpretation
    )

    return sheetId
  }

  /**
   * Add a sheet to the internal store.
   */
  private async addSheet(
    batchId: string,
    frontOriginalBallotImagePath: string,
    frontNormalizedBallotImagePath: string,
    frontInterpretation: PageInterpretation,
    backOriginalBallotImagePath: string,
    backNormalizedBallotImagePath: string,
    backInterpretation: PageInterpretation
  ): Promise<string> {
    if ('metadata' in frontInterpretation && 'metadata' in backInterpretation) {
      if (
        'pageNumber' in frontInterpretation.metadata &&
        'pageNumber' in backInterpretation.metadata
      ) {
        if (
          frontInterpretation.metadata.pageNumber >
          backInterpretation.metadata.pageNumber
        ) {
          ;[frontInterpretation, backInterpretation] = [
            backInterpretation,
            frontInterpretation,
          ]
          ;[frontOriginalBallotImagePath, backOriginalBallotImagePath] = [
            backOriginalBallotImagePath,
            frontOriginalBallotImagePath,
          ]
          ;[frontNormalizedBallotImagePath, backNormalizedBallotImagePath] = [
            backNormalizedBallotImagePath,
            frontNormalizedBallotImagePath,
          ]
        }
      }
    }

    const ballotId = await this.store.addSheet(uuid(), batchId, [
      {
        originalFilename: frontOriginalBallotImagePath,
        normalizedFilename: frontNormalizedBallotImagePath,
        interpretation: frontInterpretation,
      },
      {
        originalFilename: backOriginalBallotImagePath,
        normalizedFilename: backNormalizedBallotImagePath,
        interpretation: backInterpretation,
      },
    ])

    return ballotId
  }

  private async finishBatch(error?: string): Promise<void> {
    if (this.batchId) {
      await this.store.finishBatch({ batchId: this.batchId, error })
      this.batchId = undefined
    }

    if (this.sheetGenerator) {
      if (error) {
        await this.sheetGenerator.throw(new Error(error))
      }
      this.sheetGenerator = undefined
    }
  }

  /**
   * Scan a single sheet and see how it looks
   */
  private async scanOneSheet(): Promise<void> {
    if (!this.sheetGenerator || !this.batchId) {
      return
    }

    const { done, value: sheet } = await this.sheetGenerator.next()

    if (done) {
      debug('closing batch %s', this.batchId)
      await this.finishBatch()
    } else {
      debug('got a ballot card: %o', sheet)
      const sheetId = await this.sheetAdded(sheet, this.batchId)
      debug('got a ballot card: %o, %s', sheet, sheetId)

      const adjudicationStatus = await this.store.adjudicationStatus()
      if (adjudicationStatus.remaining === 0) {
        await this.continueImport()
      }
    }
  }

  /**
   * Create a new batch and begin the scanning process
   */
  public async startImport(): Promise<string> {
    const election = await this.store.getElectionDefinition()

    if (!election) {
      throw new Error('no election configuration')
    }

    if (this.sheetGenerator) {
      throw new Error('scanning already in progess')
    }

    if (!this.interpreterReady) {
      throw new Error('interpreter still loading')
    }

    this.batchId = await this.store.addBatch()
    debug('scanning starting for batch: %s', this.batchId)
    this.sheetGenerator = this.scanner.scanSheets(this.scannedImagesPath)

    await this.continueImport()

    return this.batchId
  }

  /**
   * Continue the existing scanning process
   */
  public async continueImport(override = false): Promise<void> {
    if (this.sheetGenerator && this.batchId) {
      const sheet = await this.store.getNextAdjudicationSheet()

      if (sheet) {
        if (override) {
          for (const side of ['front', 'back'] as Side[]) {
            await this.store.saveBallotAdjudication(sheet.id, side, {})
          }
        } else {
          await this.store.deleteSheet(sheet.id)
        }
      }

      this.scanOneSheet().catch((err) => {
        debug('processing sheet failed with error: %s', err.stack)
        this.finishBatch(err.toString())
      })
    } else {
      throw new Error('no scanning job in progress')
    }
  }

  /**
   * this is really for testing
   */
  public async waitForEndOfBatchOrScanningPause(): Promise<void> {
    if (!this.batchId) {
      return
    }

    const adjudicationStatus = await this.store.adjudicationStatus()
    if (adjudicationStatus.remaining > 0) {
      return
    }

    await sleep(200)
    return this.waitForEndOfBatchOrScanningPause()
  }

  /**
   * Export the current CVRs to a string.
   */
  public async doExport(): Promise<string> {
    const election = await this.store.getElectionDefinition()

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
    fsExtra.emptyDirSync(this.scannedImagesPath)
    fsExtra.emptyDirSync(this.importedImagesPath)
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  public async getStatus(): Promise<ScanStatus> {
    const election = await this.store.getElectionDefinition()
    const batches = await this.store.batchStatus()
    const adjudication = await this.store.adjudicationStatus()
    if (election) {
      return { electionHash: election.electionHash, batches, adjudication }
    }
    return { batches, adjudication }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure(): Promise<void> {
    this.invalidateInterpreterConfig()
    await this.doZero()
    await this.store.reset() // destroy all data

    // erase the temporary directories
    const tmpdir = join(__dirname, '../tmp')
    rimraf(tmpdir)

    // and restore the ones we're using
    fsExtra.mkdirpSync(tmpdir)
    fsExtra.mkdirpSync(this.scannedImagesPath)
    fsExtra.mkdirpSync(this.importedImagesPath)
  }
}
