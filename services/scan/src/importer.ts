import { Scan } from '@votingworks/api';
import {
  BallotPageLayout,
  BallotPageLayoutWithImage,
  ElectionDefinition,
  err,
  MarkAdjudications,
  MarkThresholds,
  ok,
  PageInterpretation,
  PageInterpretationWithFiles,
  Result,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION, find, sleep } from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import * as streams from 'memory-streams';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { BatchControl, BatchScanner } from './fujitsu_scanner';
import { SheetOf } from './types';
import { Castability, checkSheetCastability } from './util/castability';
import { HmpbInterpretationError } from './util/hmpb_interpretation_error';
import { pdfToImages } from './util/pdf_to_images';
import { Workspace } from './util/workspace';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';
import * as workers from './workers/combined';
import * as interpretNhWorker from './workers/interpret_nh';
import * as interpretVxWorker from './workers/interpret_vx';
import { inlinePool, WorkerPool } from './workers/pool';
import * as qrcodeWorker from './workers/qrcode';

const debug = makeDebug('scan:importer');

export interface Options {
  workspace: Workspace;
  scanner: BatchScanner;
  workerPoolProvider?: () => WorkerPool<workers.Input, workers.Output>;
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export class Importer {
  private readonly workspace: Workspace;
  private readonly scanner: BatchScanner;
  private sheetGenerator?: BatchControl;
  private batchId?: string;
  private workerPool?: WorkerPool<workers.Input, workers.Output>;
  private readonly workerPoolProvider: () => WorkerPool<
    workers.Input,
    workers.Output
  >;
  private interpreterReady = true;

  constructor({
    workspace,
    scanner,
    workerPoolProvider = (): WorkerPool<workers.Input, workers.Output> =>
      inlinePool<workers.Input, workers.Output>(workers.call),
  }: Options) {
    this.workspace = workspace;
    this.scanner = scanner;
    this.workerPoolProvider = workerPoolProvider;
  }

  private invalidateInterpreterConfig(): void {
    this.interpreterReady = false;
    this.workerPool?.stop();
    this.workerPool = undefined;
  }

  private async getWorkerPool(): Promise<
    WorkerPool<workers.Input, workers.Output>
  > {
    if (!this.workerPool) {
      this.workerPool = this.workerPoolProvider();
      this.workerPool.start();
      await this.workerPool.callAll({
        action: 'configure',
        dbPath: this.workspace.store.getDbPath(),
      });
      this.interpreterReady = true;
    }
    return this.workerPool;
  }

  async addHmpbTemplates(
    pdf: Buffer,
    layouts: readonly BallotPageLayout[]
  ): Promise<BallotPageLayoutWithImage[]> {
    const electionDefinition = this.workspace.store.getElectionDefinition();
    const result: BallotPageLayoutWithImage[] = [];

    if (!electionDefinition) {
      throw new HmpbInterpretationError(
        `cannot add a HMPB template without a configured election`
      );
    }

    for await (const { page, pageNumber } of pdfToImages(pdf, {
      scale: 2,
    })) {
      const ballotPageLayout = find(
        layouts,
        (l) => l.metadata.pageNumber === pageNumber
      );
      result.push({ ballotPageLayout, imageData: page });
    }

    this.workspace.store.addHmpbTemplate(
      pdf,
      result[0].ballotPageLayout.metadata,
      // remove ballot image for storage
      result.map(({ ballotPageLayout }) => ballotPageLayout)
    );

    this.invalidateInterpreterConfig();

    return result;
  }

  /**
   * Tell the importer that we have all the templates
   */
  async doneHmpbTemplates(): Promise<void> {
    await this.getWorkerPool();
  }

  /**
   * Sets the election information used to encode and decode ballots.
   */
  configure(electionDefinition: ElectionDefinition): void {
    this.workspace.store.setElection(electionDefinition);
    // Central scanner only uses all precinct mode, set on every configure
    this.workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  }

  async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode);
    await this.doZero();
    this.workspace.store.setTestMode(testMode);
    await this.restoreConfig();
  }

  setSkipElectionHashCheck(skipElectionHashCheck: boolean): void {
    debug(
      'setting skip check election hash setting to %s',
      skipElectionHashCheck
    );
    this.workspace.store.setSkipElectionHashCheck(skipElectionHashCheck);
  }

  async setMarkThresholdOverrides(
    markThresholds?: MarkThresholds
  ): Promise<void> {
    debug('setting mark thresholds overrides to %s', markThresholds);
    this.workspace.store.setMarkThresholdOverrides(markThresholds);
    await this.restoreConfig();
  }

  /**
   * Restore configuration from the store.
   */
  async restoreConfig(): Promise<void> {
    this.invalidateInterpreterConfig();
    await this.getWorkerPool();
  }

  private async sheetAdded(
    paths: SheetOf<string>,
    batchId: string
  ): Promise<string> {
    const start = Date.now();
    try {
      debug('sheetAdded %o batchId=%s STARTING', paths, batchId);
      return await this.importSheet(batchId, paths[0], paths[1]);
    } finally {
      const end = Date.now();
      debug(
        'sheetAdded %o batchId=%s FINISHED in %dms',
        paths,
        batchId,
        Math.round(end - start)
      );
    }
  }

  async importSheet(
    batchId: string,
    frontImagePath: string,
    backImagePath: string
  ): Promise<string> {
    let sheetId = uuid();
    const electionDefinition = this.workspace.store.getElectionDefinition();
    if (!electionDefinition) {
      throw new Error('missing election definition');
    }
    const interpretResult = await this.interpretSheet(sheetId, [
      frontImagePath,
      backImagePath,
    ]);

    if (interpretResult.isErr()) {
      throw interpretResult.err();
    }

    const [
      {
        originalFilename: frontOriginalFilename,
        normalizedFilename: frontNormalizedFilename,
      },
      {
        originalFilename: backOriginalFilename,
        normalizedFilename: backNormalizedFilename,
      },
    ] = interpretResult.ok();
    let [
      { interpretation: frontInterpretation },
      { interpretation: backInterpretation },
    ] = interpretResult.ok();

    debug(
      'interpreted %s (%s): %O',
      frontImagePath,
      frontInterpretation.type,
      frontInterpretation
    );
    debug(
      'interpreted %s (%s): %O',
      backImagePath,
      backInterpretation.type,
      backInterpretation
    );

    const validationResult = validateSheetInterpretation([
      frontInterpretation,
      backInterpretation,
    ]);
    if (validationResult.isErr()) {
      const error = validationResult.err();
      const errDescription = describeValidationError(error);
      debug(
        'rejecting sheet because it would not produce a valid CVR: error=%s: %o',
        errDescription,
        error
      );
      // replaces interpretation with something that cannot be accepted
      frontInterpretation = {
        type: 'UnreadablePage',
        reason: `invalid CVR: ${errDescription}`,
      };
      backInterpretation = {
        type: 'UnreadablePage',
        reason: `invalid CVR: ${errDescription}`,
      };
    }

    sheetId = await this.addSheet(
      batchId,
      frontOriginalFilename,
      frontNormalizedFilename,
      frontInterpretation,
      backOriginalFilename,
      backNormalizedFilename,
      backInterpretation
    );

    return sheetId;
  }

  private async interpretSheet(
    sheetId: string,
    [frontImagePath, backImagePath]: SheetOf<string>
  ): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>> {
    const workerPool = await this.getWorkerPool();
    const electionDefinition = this.workspace.store.getElectionDefinition();

    if (!electionDefinition) {
      return err(new Error('missing election definition'));
    }

    // Carve-out for NH ballots, which are the only ones that use `gridLayouts`
    // for now.
    if (electionDefinition.election.gridLayouts) {
      const nhInterpretPromise = workerPool.call({
        action: 'interpret',
        interpreter: 'nh',
        frontImagePath,
        backImagePath,
        sheetId,
        ballotImagesPath: this.workspace.ballotImagesPath,
      });

      return (await nhInterpretPromise) as interpretNhWorker.InterpretOutput;
    }

    const frontDetectQrcodePromise = workerPool.call({
      action: 'detect-qrcode',
      imagePath: frontImagePath,
    });
    const backDetectQrcodePromise = workerPool.call({
      action: 'detect-qrcode',
      imagePath: backImagePath,
    });
    const [frontDetectQrcodeOutput, backDetectQrcodeOutput] =
      qrcodeWorker.normalizeSheetOutput(electionDefinition, [
        (await frontDetectQrcodePromise) as qrcodeWorker.Output,
        (await backDetectQrcodePromise) as qrcodeWorker.Output,
      ]);
    const frontInterpretPromise = workerPool.call({
      action: 'interpret',
      interpreter: 'vx',
      imagePath: frontImagePath,
      sheetId,
      ballotImagesPath: this.workspace.ballotImagesPath,
      detectQrcodeResult: frontDetectQrcodeOutput,
    });
    const backInterpretPromise = workerPool.call({
      action: 'interpret',
      interpreter: 'vx',
      imagePath: backImagePath,
      sheetId,
      ballotImagesPath: this.workspace.ballotImagesPath,
      detectQrcodeResult: backDetectQrcodeOutput,
    });

    return ok([
      (await frontInterpretPromise) as interpretVxWorker.InterpretOutput,
      (await backInterpretPromise) as interpretVxWorker.InterpretOutput,
    ]);
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
          return this.addSheet(
            batchId,
            backOriginalBallotImagePath,
            backNormalizedBallotImagePath,
            backInterpretation,
            frontOriginalBallotImagePath,
            frontNormalizedBallotImagePath,
            frontInterpretation
          );
        }
      }
    }

    const ballotId = this.workspace.store.addSheet(uuid(), batchId, [
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
    ]);

    return ballotId;
  }

  private async finishBatch(error?: string): Promise<void> {
    if (this.batchId) {
      this.workspace.store.finishBatch({ batchId: this.batchId, error });
      this.batchId = undefined;
    }

    if (this.sheetGenerator) {
      await this.sheetGenerator.endBatch();
      this.sheetGenerator = undefined;
    }
  }

  /**
   * Scan a single sheet and see how it looks
   */
  private async scanOneSheet(): Promise<void> {
    if (!this.sheetGenerator || !this.batchId) {
      return;
    }

    const sheet = await this.sheetGenerator.scanSheet();

    if (!sheet) {
      debug('closing batch %s', this.batchId);
      await this.finishBatch();
    } else {
      debug('got a ballot card: %o', sheet);
      const sheetId = await this.sheetAdded(sheet, this.batchId);
      debug('got a ballot card: %o, %s', sheet, sheetId);

      const adjudicationStatus = this.workspace.store.adjudicationStatus();
      if (adjudicationStatus.remaining === 0) {
        if (!(await this.sheetGenerator.acceptSheet())) {
          debug('failed to accept interpreted sheet: %s', sheetId);
        }
        await this.continueImport({ forceAccept: false });
      } else {
        const castability = this.getNextAdjudicationCastability();
        if (castability) {
          if (castability === Castability.Uncastable) {
            await this.sheetGenerator.rejectSheet();
          } else {
            await this.sheetGenerator.reviewSheet();
          }
        }
      }
    }
  }

  getNextAdjudicationCastability(): Castability | undefined {
    const sheet = this.workspace.store.getNextAdjudicationSheet();
    if (sheet) {
      return checkSheetCastability([
        sheet.front.interpretation,
        sheet.back.interpretation,
      ]);
    }
  }

  /**
   * Create a new batch and begin the scanning process
   */
  async startImport(): Promise<string> {
    const election = this.workspace.store.getElectionDefinition();

    if (!election) {
      throw new Error('no election configuration');
    }

    if (this.sheetGenerator) {
      throw new Error('scanning already in progress');
    }

    if (!this.interpreterReady) {
      throw new Error('interpreter still loading');
    }

    this.batchId = this.workspace.store.addBatch();
    const batchScanDirectory = join(
      this.workspace.ballotImagesPath,
      `batch-${this.batchId}`
    );
    await fsExtra.ensureDir(batchScanDirectory);
    debug(
      'scanning starting for batch %s into %s',
      this.batchId,
      batchScanDirectory
    );
    const ballotPaperSize =
      this.workspace.store.getBallotPaperSizeForElection();
    this.sheetGenerator = this.scanner.scanSheets({
      directory: batchScanDirectory,
      pageSize: ballotPaperSize,
    });

    await this.continueImport({ forceAccept: false });

    return this.batchId;
  }

  /**
   * Continue the existing scanning process
   */
  async continueImport(options: { forceAccept: false }): Promise<void>;
  async continueImport(options: {
    forceAccept: true;
    frontMarkAdjudications: MarkAdjudications;
    backMarkAdjudications: MarkAdjudications;
  }): Promise<void>;
  async continueImport(options: {
    forceAccept: boolean;
    frontMarkAdjudications?: MarkAdjudications;
    backMarkAdjudications?: MarkAdjudications;
  }): Promise<void> {
    const sheet = this.workspace.store.getNextAdjudicationSheet();

    if (sheet) {
      if (options.forceAccept) {
        await this.sheetGenerator?.acceptSheet();
        this.workspace.store.adjudicateSheet(
          sheet.id,
          'front',
          options.frontMarkAdjudications ?? []
        );
        this.workspace.store.adjudicateSheet(
          sheet.id,
          'back',
          options.backMarkAdjudications ?? []
        );
      } else {
        await this.sheetGenerator?.rejectSheet();
        this.workspace.store.deleteSheet(sheet.id);
      }
    }

    if (this.sheetGenerator && this.batchId) {
      this.scanOneSheet().catch((error) => {
        debug('processing sheet failed with error: %s', error.stack);
        void this.finishBatch(error.toString());
      });
    } else {
      throw new Error('no scanning job in progress');
    }
  }

  /**
   * this is really for testing
   */
  async waitForEndOfBatchOrScanningPause(): Promise<void> {
    if (!this.batchId) {
      return;
    }

    const adjudicationStatus = this.workspace.store.adjudicationStatus();
    if (adjudicationStatus.remaining > 0) {
      return;
    }

    await sleep(200);
    return this.waitForEndOfBatchOrScanningPause();
  }

  /**
   * Export the current CVRs to a string.
   */
  doExport(): string {
    const election = this.workspace.store.getElectionDefinition();

    if (!election) {
      return '';
    }

    const outputStream = new streams.WritableStream();
    this.workspace.store.exportCvrs(outputStream);
    return outputStream.toString();
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  async doZero(): Promise<void> {
    this.workspace.zero();
    await this.setMarkThresholdOverrides(undefined);
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  getStatus(): Scan.ScanStatus {
    const electionDefinition = this.workspace.store.getElectionDefinition();
    const canUnconfigure = this.workspace.store.getCanUnconfigure();
    const batches = this.workspace.store.batchStatus();
    const adjudication = this.workspace.store.adjudicationStatus();

    return {
      electionHash: electionDefinition?.electionHash,
      batches,
      canUnconfigure,
      adjudication,
    };
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  async unconfigure(): Promise<void> {
    this.invalidateInterpreterConfig();
    await this.doZero();
    this.workspace.store.reset(); // destroy all data
  }
}
