import makeDebug from 'debug'
import sharp, { Raw } from 'sharp'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'
import { v4 as uuid } from 'uuid'
import { Election } from '@votingworks/ballot-encoder'
import { BallotPageLayout } from '@votingworks/hmpb-interpreter'

import { BallotMetadata, ScanStatus, SheetOf } from './types'
import Store from './store'
import DefaultInterpreter, {
  Interpreter,
  PageInterpretation,
} from './interpreter'
import { Scanner } from './scanner'
import pdfToImages from './util/pdfToImages'

const debug = makeDebug('module-scan:importer')

const sleep = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface Options {
  store: Store
  scanner: Scanner
  scannedImagesPath: string
  importedImagesPath: string
  interpreter?: Interpreter
}

export interface Importer {
  addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]>
  configure(newElection: Election): Promise<void>
  doExport(): Promise<string>
  startImport(): Promise<string>
  continueImport(): Promise<void>
  waitForEndOfBatch(): Promise<void>
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

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class SystemImporter implements Importer {
  private store: Store
  private scanner: Scanner
  private interpreter: Interpreter
  private sheetGenerator: AsyncGenerator<SheetOf<string>> | undefined
  private batchId: string | undefined

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
    interpreter = new DefaultInterpreter(),
  }: Options) {
    this.store = store
    this.scanner = scanner
    this.interpreter = interpreter
    this.scannedImagesPath = scannedImagesPath
    this.importedImagesPath = importedImagesPath

    // make sure those directories exist
    for (const imagesPath of [scannedImagesPath, importedImagesPath]) {
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
   * Sets the election information used to encode and decode ballots.
   */
  public async configure(newElection: Election): Promise<void> {
    await this.store.setElection(newElection)
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

  private async sheetAdded(
    paths: SheetOf<string>,
    batchId: string
  ): Promise<void> {
    const start = Date.now()
    try {
      debug('sheetAdded %o batchId=%s STARTING', paths, batchId)
      await this.importFile(batchId, paths[0], paths[1])
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
    const election = await this.store.getElection()

    if (!election) {
      throw new Error('no election is configured')
    }

    let sheetId = uuid()
    const frontImageData = await fsExtra.readFile(frontImagePath)

    const frontInterpretFileResult = await this.interpreter.interpretFile({
      election,
      ballotImagePath: frontImagePath,
      ballotImageFile: frontImageData,
    })

    debug(
      'interpreted %s (%s): %O',
      frontImagePath,
      frontInterpretFileResult.interpretation.type,
      frontInterpretFileResult.interpretation
    )

    const frontImages = await this.saveImages(
      sheetId,
      frontImagePath,
      frontInterpretFileResult.normalizedImage
    )

    const backImageData = await fsExtra.readFile(backImagePath)

    const backInterpretFileResult = await this.interpreter.interpretFile({
      election,
      ballotImagePath: backImagePath,
      ballotImageFile: backImageData,
    })

    debug(
      'interpreted %s (%s): %O',
      backImagePath,
      backInterpretFileResult.interpretation.type,
      backInterpretFileResult.interpretation
    )

    const backImages = await this.saveImages(
      sheetId,
      backImagePath,
      backInterpretFileResult.normalizedImage
    )

    sheetId = await this.addSheet(
      batchId,
      frontImages.original,
      frontImages.normalized,
      frontInterpretFileResult.interpretation,
      backImages.original,
      backImages.normalized,
      backInterpretFileResult.interpretation
    )

    return sheetId
  }

  private async saveImages(
    id: string,
    imagePath: string,
    normalizedImage?: ImageData
  ): Promise<{
    original: string
    normalized: string
  }> {
    const ext = path.extname(imagePath)
    const original = path.join(
      this.importedImagesPath,
      `${path.basename(imagePath, ext)}-${id}-original${ext}`
    )

    await fsExtra.copy(imagePath, original)

    if (normalizedImage) {
      const normalized = path.join(
        this.importedImagesPath,
        `${path.basename(imagePath, ext)}-${id}-normalized${ext}`
      )
      debug('about to write normalized ballot image to %s', normalized)
      await fsExtra.writeFile(
        normalized,
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
      debug('wrote normalized ballot image to %s', normalized)
      return { original, normalized }
    }

    return { original, normalized: original }
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
      await this.store.finishBatch(this.batchId)
      this.sheetGenerator = undefined
      this.batchId = undefined
    } else {
      debug('got a ballot card: %o', sheet)
      await this.sheetAdded(sheet, this.batchId)
      await this.continueImport()
    }
  }

  /**
   * Create a new batch and begin the scanning process
   */
  public async startImport(): Promise<string> {
    const election = await this.store.getElection()

    if (!election) {
      throw new Error('no election configuration')
    }

    if (this.sheetGenerator) {
      throw new Error('scanning already in progess')
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
  public async continueImport(): Promise<void> {
    if (this.sheetGenerator) {
      setImmediate(() => this.scanOneSheet())
    } else {
      throw new Error('no scanning job in progress')
    }
  }

  /**
   * this is really for testing
   */
  public async waitForEndOfBatch(): Promise<void> {
    if (!this.batchId) {
      return
    }

    await sleep(200)
    return this.waitForEndOfBatch()
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
    fsExtra.emptyDirSync(this.scannedImagesPath)
    fsExtra.emptyDirSync(this.importedImagesPath)
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
    await this.store.reset() // destroy all data
  }
}
