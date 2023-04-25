import { Scan } from '@votingworks/api';
import {
  detectQrcodeInFilePath,
  normalizeSheetOutput,
} from '@votingworks/ballot-interpreter-vx';
import { Result, assert, find, ok, sleep } from '@votingworks/basics';
import { pdfToImages } from '@votingworks/image-utils';
import {
  BallotPageLayout,
  BallotPageLayoutWithImage,
  ElectionDefinition,
  MarkThresholds,
  PageInterpretation,
  PageInterpretationWithFiles,
  SheetOf,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import { Buffer } from 'buffer';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { BatchControl, BatchScanner } from './fujitsu_scanner';
import { Castability, checkSheetCastability } from './util/castability';
import { Workspace } from './util/workspace';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';
import * as nhInterpreter from './interpreters/nh';
import * as vxInterpreter from './interpreters/vx';

const debug = makeDebug('scan:importer');

export interface Options {
  workspace: Workspace;
  scanner: BatchScanner;
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export class Importer {
  private readonly workspace: Workspace;
  private readonly scanner: BatchScanner;
  private sheetGenerator?: BatchControl;
  private batchId?: string;
  private interpreterState: 'init' | 'configuring' | 'ready' = 'init';
  private interpreterReadyPromise?: Promise<void>;

  constructor({ workspace, scanner }: Options) {
    this.workspace = workspace;
    this.scanner = scanner;
  }

  private invalidateInterpreterConfig(): void {
    this.interpreterReadyPromise = undefined;
    this.interpreterState = 'init';
  }

  private async configureInterpreter(): Promise<void> {
    if (!this.interpreterReadyPromise) {
      this.interpreterState = 'configuring';
      this.interpreterReadyPromise = Promise.resolve().then(async () => {
        await vxInterpreter.configure(this.workspace.store);
        this.interpreterState = 'ready';
      });
    }
    return this.interpreterReadyPromise;
  }

  async addHmpbTemplates(
    pdf: Buffer,
    layouts: readonly BallotPageLayout[]
  ): Promise<BallotPageLayoutWithImage[]> {
    this.getElectionDefinition(); // ensure election definition is loaded
    const result: BallotPageLayoutWithImage[] = [];

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
      result
    );

    this.invalidateInterpreterConfig();

    return result;
  }

  /**
   * Tell the importer that we have all the templates
   */
  async doneHmpbTemplates(): Promise<void> {
    await this.configureInterpreter();
  }

  /**
   * Sets the election information used to encode and decode ballots.
   */
  configure(
    electionDefinition: ElectionDefinition,
    jurisdiction: string
  ): void {
    this.workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
    });
    // Central scanner only uses all precinct mode, set on every configure
    this.workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  }

  async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode);
    this.doZero();
    this.workspace.store.setTestMode(testMode);
    await this.restoreConfig();
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
    await this.configureInterpreter();
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
    const electionDefinition = this.getElectionDefinition();

    // Carve-out for NH ballots, which are the only ones that use `gridLayouts`
    // for now.
    if (electionDefinition.election.gridLayouts) {
      return await nhInterpreter.interpret(
        this.workspace.store,
        sheetId,
        [frontImagePath, backImagePath],
        this.workspace.ballotImagesPath
      );
    }

    const frontDetectQrcodePromise = detectQrcodeInFilePath(frontImagePath);
    const backDetectQrcodePromise = detectQrcodeInFilePath(backImagePath);
    const [frontDetectQrcodeOutput, backDetectQrcodeOutput] =
      normalizeSheetOutput(electionDefinition, [
        await frontDetectQrcodePromise,
        await backDetectQrcodePromise,
      ]);
    const frontInterpretPromise = vxInterpreter.interpret(
      frontImagePath,
      sheetId,
      this.workspace.ballotImagesPath,
      frontDetectQrcodeOutput
    );
    const backInterpretPromise = vxInterpreter.interpret(
      backImagePath,
      sheetId,
      this.workspace.ballotImagesPath,
      backDetectQrcodeOutput
    );

    return ok([await frontInterpretPromise, await backInterpretPromise]);
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
    assert(
      typeof this.sheetGenerator !== 'undefined' &&
        typeof this.batchId !== 'undefined'
    );

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
    this.getElectionDefinition(); // ensure election definition is loaded

    if (this.sheetGenerator) {
      throw new Error('scanning already in progress');
    }

    if (this.interpreterState !== 'ready') {
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
  async continueImport(options: { forceAccept: boolean }): Promise<void> {
    const sheet = this.workspace.store.getNextAdjudicationSheet();

    if (sheet) {
      if (options.forceAccept) {
        await this.sheetGenerator?.acceptSheet();
        this.workspace.store.adjudicateSheet(sheet.id);
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
   * Reset all the data, both in the store and the ballot images.
   */
  doZero(): void {
    this.workspace.resetElectionSession();
  }

  /**
   * Get the imported batches and current election info, if any.
   */
  getStatus(): Scan.ScanStatus {
    const electionDefinition = this.getElectionDefinition();
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
  unconfigure(): void {
    this.invalidateInterpreterConfig();
    this.doZero();
    this.workspace.store.reset(); // destroy all data
  }

  private getElectionDefinition(): ElectionDefinition {
    const electionDefinition = this.workspace.store.getElectionDefinition();

    if (!electionDefinition) {
      throw new Error('no election configuration');
    }

    return electionDefinition;
  }
}
