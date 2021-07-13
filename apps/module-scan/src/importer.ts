import { BallotPageLayout, Interpreter } from '@votingworks/hmpb-interpreter'
import {
  ElectionDefinition,
  MarkThresholds,
  Optional,
} from '@votingworks/types'
import { ScanStatus } from '@votingworks/types/api/module-scan'
import { sleep } from '@votingworks/utils'
import makeDebug from 'debug'
import * as fsExtra from 'fs-extra'
import * as streams from 'memory-streams'
import { join } from 'path'
import { v4 as uuid } from 'uuid'
import { PageInterpretation } from './interpreter'
import { BatchControl, Scanner } from './scanners'
import { BallotMetadata, SheetOf, Side } from './types'
import { Castability, checkSheetCastability } from './util/castability'
import { writeImageData } from './util/images'
import pdfToImages from './util/pdfToImages'
import { Workspace } from './util/workspace'
import * as workers from './workers/combined'
import { InterpretOutput } from './workers/interpret'
import { inlinePool, WorkerPool } from './workers/pool'
import * as qrcodeWorker from './workers/qrcode'

const debug = makeDebug('module-scan:importer')

export interface Options {
  workspace: Workspace
  scanner: Scanner
  workerPoolProvider?: () => WorkerPool<workers.Input, workers.Output>
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
  if (imagePath !== originalImagePath) {
    debug('linking image file %s from %s', imagePath, originalImagePath)
    await fsExtra.link(imagePath, originalImagePath)
  }

  if (normalizedImage) {
    debug('about to write normalized ballot image to %s', normalizedImagePath)
    await writeImageData(normalizedImagePath, normalizedImage)
    debug('wrote normalized ballot image to %s', normalizedImagePath)
    return { original: originalImagePath, normalized: normalizedImagePath }
  }

  return { original: originalImagePath, normalized: originalImagePath }
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export default class Importer {
  private workspace: Workspace
  private scanner: Scanner
  private sheetGenerator: BatchControl | undefined
  private batchId: string | undefined
  private workerPool?: WorkerPool<workers.Input, workers.Output>
  private workerPoolProvider: () => WorkerPool<workers.Input, workers.Output>
  private interpreterReady = true

  public constructor({
    workspace,
    scanner,
    workerPoolProvider = (): WorkerPool<workers.Input, workers.Output> =>
      inlinePool<workers.Input, workers.Output>(workers.call),
  }: Options) {
    this.workspace = workspace
    this.scanner = scanner
    this.workerPoolProvider = workerPoolProvider
  }

  private invalidateInterpreterConfig(): void {
    this.interpreterReady = false
    this.workerPool?.stop()
    this.workerPool = undefined
  }

  private async getWorkerPool(): Promise<
    WorkerPool<workers.Input, workers.Output>
  > {
    if (!this.workerPool) {
      this.workerPool = this.workerPoolProvider()
      this.workerPool.start()
      await this.workerPool.callAll({
        action: 'configure',
        dbPath: this.workspace.store.dbPath,
      })
      this.interpreterReady = true
    }
    return this.workerPool
  }

  public async addHmpbTemplates(
    pdf: Buffer,
    metadata: BallotMetadata
  ): Promise<BallotPageLayout[]> {
    const electionDefinition = await this.workspace.store.getElectionDefinition()
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

    await this.workspace.store.addHmpbTemplate(
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
    await this.getWorkerPool()
  }

  /**
   * Sets the election information used to encode and decode ballots.
   */
  public async configure(
    electionDefinition: ElectionDefinition
  ): Promise<void> {
    await this.workspace.store.setElection(electionDefinition)
  }

  public async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode)
    await this.doZero()
    await this.workspace.store.setTestMode(testMode)
    await this.restoreConfig()
  }

  public async setSkipElectionHashCheck(
    skipElectionHashCheck: boolean
  ): Promise<void> {
    debug(
      'setting skip check election hash setting to %s',
      skipElectionHashCheck
    )
    await this.workspace.store.setSkipElectionHashCheck(skipElectionHashCheck)
  }

  public async setMarkThresholdOverrides(
    markThresholds: Optional<MarkThresholds>
  ): Promise<void> {
    debug('setting mark thresholds overrides to %s', markThresholds)
    await this.workspace.store.setMarkThresholdOverrides(markThresholds)
    await this.restoreConfig()
  }

  /**
   * Restore configuration from the store.
   */
  public async restoreConfig(): Promise<void> {
    this.invalidateInterpreterConfig()
    await this.getWorkerPool()
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
    const electionDefinition = await this.workspace.store.getElectionDefinition()
    if (!electionDefinition) {
      throw new Error('missing election definition')
    }
    const currentPrecinctId = await this.workspace.store.getCurrentPrecinctId()

    const workerPool = await this.getWorkerPool()
    const frontDetectQrcodePromise = workerPool.call({
      action: 'detect-qrcode',
      imagePath: frontImagePath,
    })
    const backDetectQrcodePromise = workerPool.call({
      action: 'detect-qrcode',
      imagePath: backImagePath,
    })
    const [
      frontDetectQrcodeOutput,
      backDetectQrcodeOutput,
    ] = qrcodeWorker.normalizeSheetOutput(electionDefinition.election, [
      (await frontDetectQrcodePromise) as qrcodeWorker.Output,
      (await backDetectQrcodePromise) as qrcodeWorker.Output,
    ])
    const frontInterpretPromise = workerPool.call({
      action: 'interpret',
      imagePath: frontImagePath,
      sheetId,
      ballotImagesPath: this.workspace.ballotImagesPath,
      detectQrcodeResult: frontDetectQrcodeOutput,
    })
    const backInterpretPromise = workerPool.call({
      action: 'interpret',
      imagePath: backImagePath,
      sheetId,
      ballotImagesPath: this.workspace.ballotImagesPath,
      detectQrcodeResult: backDetectQrcodeOutput,
    })

    let frontWorkerOutput = (await frontInterpretPromise) as InterpretOutput
    let backWorkerOutput = (await backInterpretPromise) as InterpretOutput

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

    debug('currentPrecinctId=%s', currentPrecinctId)
    if (currentPrecinctId) {
      if (
        (frontWorkerOutput.interpretation.type === 'InterpretedHmpbPage' ||
          frontWorkerOutput.interpretation.type === 'InterpretedBmdPage') &&
        frontWorkerOutput.interpretation.metadata.precinctId !==
          currentPrecinctId
      ) {
        debug(
          'rejecting front page %s because it does not match the current precinct id: %s',
          frontImagePath,
          currentPrecinctId
        )
        frontWorkerOutput = {
          ...frontWorkerOutput,
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: frontWorkerOutput.interpretation.metadata,
          },
        }
      }
      if (
        (backWorkerOutput.interpretation.type === 'InterpretedHmpbPage' ||
          backWorkerOutput.interpretation.type === 'InterpretedBmdPage') &&
        backWorkerOutput.interpretation.metadata.precinctId !==
          currentPrecinctId
      ) {
        debug(
          'rejecting back page %s because it does not match the current precinct id: %s',
          frontImagePath,
          currentPrecinctId
        )
        backWorkerOutput = {
          ...backWorkerOutput,
          interpretation: {
            type: 'InvalidPrecinctPage',
            metadata: backWorkerOutput.interpretation.metadata,
          },
        }
      }
    }

    sheetId = await this.addSheet(
      batchId,
      frontWorkerOutput.originalFilename,
      frontWorkerOutput.normalizedFilename,
      frontWorkerOutput.interpretation,
      backWorkerOutput.originalFilename,
      backWorkerOutput.normalizedFilename,
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

    const ballotId = await this.workspace.store.addSheet(uuid(), batchId, [
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
      await this.workspace.store.finishBatch({ batchId: this.batchId, error })
      this.batchId = undefined
    }

    if (this.sheetGenerator) {
      await this.sheetGenerator.endBatch()
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

    const sheet = await this.sheetGenerator.scanSheet()

    if (!sheet) {
      debug('closing batch %s', this.batchId)
      await this.finishBatch()
    } else {
      debug('got a ballot card: %o', sheet)
      const sheetId = await this.sheetAdded(sheet, this.batchId)
      debug('got a ballot card: %o, %s', sheet, sheetId)

      const adjudicationStatus = await this.workspace.store.adjudicationStatus()
      if (adjudicationStatus.remaining === 0) {
        if (!(await this.sheetGenerator.acceptSheet())) {
          debug('failed to accept interpreted sheet: %s', sheetId)
        }
        await this.continueImport()
      } else {
        const castability = await this.getNextAdjudicationCastability()
        if (castability) {
          if (castability === Castability.Uncastable) {
            await this.sheetGenerator.rejectSheet()
          } else {
            await this.sheetGenerator.reviewSheet()
          }
        }
      }
    }
  }

  public async getNextAdjudicationCastability(): Promise<
    Castability | undefined
  > {
    const sheet = await this.workspace.store.getNextAdjudicationSheet()
    if (sheet) {
      return checkSheetCastability([
        sheet.front.interpretation,
        sheet.back.interpretation,
      ])
    }
  }

  /**
   * Create a new batch and begin the scanning process
   */
  public async startImport(): Promise<string> {
    const election = await this.workspace.store.getElectionDefinition()

    if (!election) {
      throw new Error('no election configuration')
    }

    if (this.sheetGenerator) {
      throw new Error('scanning already in progress')
    }

    if (!this.interpreterReady) {
      throw new Error('interpreter still loading')
    }

    this.batchId = await this.workspace.store.addBatch()
    const batchScanDirectory = join(
      this.workspace.ballotImagesPath,
      `batch-${this.batchId}`
    )
    await fsExtra.ensureDir(batchScanDirectory)
    debug(
      'scanning starting for batch %s into %s',
      this.batchId,
      batchScanDirectory
    )
    this.sheetGenerator = this.scanner.scanSheets(batchScanDirectory)

    await this.continueImport()

    return this.batchId
  }

  /**
   * Continue the existing scanning process
   */
  public async continueImport(override = false): Promise<void> {
    const sheet = await this.workspace.store.getNextAdjudicationSheet()

    if (sheet) {
      if (override) {
        await this.sheetGenerator?.acceptSheet()
        for (const side of ['front', 'back'] as Side[]) {
          await this.workspace.store.saveBallotAdjudication(sheet.id, side, {})
        }
      } else {
        await this.sheetGenerator?.rejectSheet()
        await this.workspace.store.deleteSheet(sheet.id)
      }
    }

    if (this.sheetGenerator && this.batchId) {
      this.scanOneSheet().catch((err) => {
        debug('processing sheet failed with error: %s', err.stack)
        void this.finishBatch(err.toString())
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

    const adjudicationStatus = await this.workspace.store.adjudicationStatus()
    if (adjudicationStatus.remaining > 0) {
      return
    }

    await sleep(200)
    return this.waitForEndOfBatchOrScanningPause()
  }

  /**
   * Tell the scanner to calibrate itself.
   *
   * @returns whether the calibration succeeded
   */
  public async doCalibrate(): Promise<boolean> {
    return await this.scanner.calibrate()
  }

  /**
   * Export the current CVRs to a string.
   */
  public async doExport(): Promise<string> {
    const election = await this.workspace.store.getElectionDefinition()

    if (!election) {
      return ''
    }

    const outputStream = new streams.WritableStream()
    await this.workspace.store.exportCVRs(outputStream)
    return outputStream.toString()
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  public async doZero(): Promise<void> {
    await this.workspace.store.zero()
    await this.setMarkThresholdOverrides(undefined)
    fsExtra.emptyDirSync(this.workspace.ballotImagesPath)
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  public async getStatus(): Promise<ScanStatus> {
    const election = await this.workspace.store.getElectionDefinition()
    const batches = await this.workspace.store.batchStatus()
    const adjudication = await this.workspace.store.adjudicationStatus()
    const scanner = await this.scanner.getStatus()
    return {
      electionHash: election?.electionHash,
      batches,
      adjudication,
      scanner,
    }
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  public async unconfigure(): Promise<void> {
    this.invalidateInterpreterConfig()
    await this.doZero()
    await this.workspace.store.reset() // destroy all data
  }
}
