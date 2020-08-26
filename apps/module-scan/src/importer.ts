import makeDebug from 'debug'
import sharp, { Raw } from 'sharp'
import * as path from 'path'
import * as fs from 'fs'
import * as streams from 'memory-streams'
import * as fsExtra from 'fs-extra'
import { v4 as uuid } from 'uuid'
import { Election } from '@votingworks/ballot-encoder'
import { BallotPageLayout } from '@votingworks/hmpb-interpreter'

import { BallotMetadata, ScanStatus } from './types'
import Store from './store'
import DefaultInterpreter, {
  Interpreter,
  InterpretedBallot,
} from './interpreter'
import { Scanner, Sheet } from './scanner'
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
  configure(newElection: Election): Promise<void>
  doExport(): Promise<string>
  doImport(): Promise<void>
  doZero(): Promise<void>
  importFile(
    batchId: string,
    ballotImagePath: string
  ): Promise<string | undefined>
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

  private async cardAdded(card: Sheet, batchId: string): Promise<void> {
    const start = Date.now()
    try {
      debug('cardAdded %o batchId=%s STARTING', card, batchId)
      await this.fileAdded(card[0], batchId)
      await this.fileAdded(card[1], batchId)
    } finally {
      const end = Date.now()
      debug(
        'cardAdded %o batchId=%s FINISHED in %dms',
        card,
        batchId,
        Math.round(end - start)
      )
    }
  }

  /**
   * Callback to inform us that a new file was seen.
   */
  private async fileAdded(
    ballotImagePath: string,
    batchId: string
  ): Promise<void> {
    const start = Date.now()
    try {
      debug('fileAdded %s batchId=%s STARTING', ballotImagePath, batchId)
      await this.importFile(batchId, ballotImagePath)
    } finally {
      const end = Date.now()
      debug(
        'fileAdded %s batchId=%s FINISHED in %dms',
        ballotImagePath,
        batchId,
        Math.round(end - start)
      )
    }
  }

  public async importFile(
    batchId: string,
    ballotImagePath: string
  ): Promise<string | undefined> {
    const election = await this.store.getElection()

    if (!election) {
      return
    }

    const ballotImageFile = await fsExtra.readFile(ballotImagePath)
    let ballotId = uuid()

    const interpreted = await this.interpreter.interpretFile({
      election,
      ballotImagePath,
      ballotImageFile,
    })

    // TODO: Handle invalid test mode ballots more explicitly.
    // At some point we want to present information to the user that tells them
    // there was a ballot that was did not match the test/live mode of the
    // scanner. For now we just ignore such ballots completely.
    if (!interpreted || interpreted.type === 'InvalidTestModeBallot') {
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
      )}-${ballotId}-original${ballotImagePathExt}`
    )
    const normalizedBallotImagePath = path.join(
      this.importedBallotImagesPath,
      `${path.basename(
        ballotImagePath,
        ballotImagePathExt
      )}-${ballotId}-normalized${ballotImagePathExt}`
    )

    ballotId = await this.addBallot(
      batchId,
      originalBallotImagePath,
      normalizedBallotImagePath,
      interpreted
    )

    if (ballotImageFile) {
      await fsExtra.writeFile(originalBallotImagePath, ballotImageFile)
    } else {
      await fsExtra.copy(ballotImagePath, originalBallotImagePath)
    }

    debug(
      'about to write normalized ballot image to %s',
      normalizedBallotImagePath
    )
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
    debug('wrote normalized ballot image to %s', normalizedBallotImagePath)

    return ballotId
  }

  /**
   * Add a ballot to the internal store.
   */
  private async addBallot(
    batchId: string,
    originalBallotImagePath: string,
    normalizedBallotImagePath: string,
    interpreted: InterpretedBallot
  ): Promise<string> {
    const ballotId = await this.store.addBallot(
      uuid(),
      batchId,
      originalBallotImagePath,
      normalizedBallotImagePath,
      interpreted
    )

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
      debug('scanning starting for batch: %s', batchId)
      for await (const sheet of this.scanner.scanSheets(
        this.ballotImagesPath
      )) {
        debug('got a ballot card: %o', sheet)
        await this.cardAdded(sheet, batchId)
      }
      debug('scanning completed successfully')
    } catch (err) {
      // node couldn't execute the command
      throw new Error(`problem scanning: ${err.stack}`)
    } finally {
      debug('closing batch %s', batchId)
      await this.store.finishBatch(batchId)
    }
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
