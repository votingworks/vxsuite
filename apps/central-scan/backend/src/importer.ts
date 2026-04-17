import {
  assertDefined,
  extractErrorMessage,
  Optional,
  sleep,
} from '@votingworks/basics';
import {
  DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
  ElectionDefinition,
  Id,
  PageInterpretation,
  PageInterpretationWithFiles,
  SheetOf,
} from '@votingworks/types';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { join } from 'node:path';
import { v4 as uuid } from 'uuid';
import { interpretSheetAndSaveImages } from '@votingworks/ballot-interpreter';
import { LogEventId, Logger } from '@votingworks/logging';
import { ImageData } from 'canvas';
import { loadImageData } from '@votingworks/image-utils';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner';
import { NODE_ENV } from './globals';
import { Workspace } from './util/workspace';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';
import { logBatchComplete, logScanSheetSuccess } from './util/logging';
import { ScanStatus } from './types';

const debug = makeDebug('scan:importer');

export const DEFAULT_MAX_SCAN_AHEAD = 0;

export interface Options {
  workspace: Workspace;
  scanner: BatchScanner;
  logger: Logger;
  /**
   * Maximum number of sheets the scanner can scan ahead of the interpreter.
   * - `0` (default): sequential (scan, interpret, scan, interpret, …)
   * - `1`+: allow bounded parallelism
   * - `Infinity`: scan as fast as possible
   *
   * **Caution:** With values > 0, if an unexpected interpretation error occurs,
   * up to `maxScanAhead` additional sheets may have been physically pulled
   * through the scanner without being recorded. The operator has no way to
   * identify which sheets in the output tray were counted and which weren't.
   * The default of 0 avoids this problem. Before increasing this value in
   * production, a reconciliation strategy is needed (e.g. re-scanning the
   * entire batch on failure, or imprinting sheet IDs for reconciliation).
   */
  maxScanAhead?: number;
  /**
   * Artificial delay (ms) added before each interpretation. Useful for
   * simulating slow interpretation on fast development machines. Ignored in
   * production mode.
   */
  artificialInterpretDelayMs?: number;
}

interface CurrentBatch {
  /**
   * The ID of the current batch being scanned.
   */
  batchId: Id;

  /**
   * The scanner control object for the current batch.
   */
  sheetGenerator: BatchControl;

  /**
   * The working directory for `sheetGenerator`, where scanned images are placed
   * before being interpreted. This directory is removed when the batch is
   * finished.
   */
  directory: string;
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export class Importer {
  private readonly workspace: Workspace;
  private readonly scanner: BatchScanner;
  private readonly logger: Logger;
  private readonly maxScanAhead: number;
  private readonly artificialInterpretDelayMs: number;
  private isStartingBatch = false;
  private currentBatch?: CurrentBatch;
  private readonly inFlightInterpretations = new Set<Promise<void>>();
  private interpretationError?: string;
  private scanLoopPromise?: Promise<void>;

  constructor({
    workspace,
    scanner,
    logger,
    maxScanAhead,
    artificialInterpretDelayMs,
  }: Options) {
    this.workspace = workspace;
    this.scanner = scanner;
    this.logger = logger;
    this.maxScanAhead = maxScanAhead ?? DEFAULT_MAX_SCAN_AHEAD;
    this.artificialInterpretDelayMs = artificialInterpretDelayMs ?? 0;
  }

  /**
   * Sets the election information used to encode and decode ballots.
   */
  configure(
    electionDefinition: ElectionDefinition,
    jurisdiction: string,
    electionPackageHash: string
  ): void {
    this.workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash,
    });
  }

  async setTestMode(testMode: boolean): Promise<void> {
    debug('setting test mode to %s', testMode);
    await this.doZero();
    this.workspace.store.setTestMode(testMode);
  }

  private async sheetAdded(
    sheetInfo: ScannedSheetInfo,
    batchId: string
  ): Promise<string> {
    const start = Date.now();
    try {
      debug(
        'sheetAdded %s %s batchId=%s STARTING',
        sheetInfo.frontPath,
        sheetInfo.backPath,
        batchId
      );
      const [frontImageData, backImageData] = await Promise.all([
        loadImageData(sheetInfo.frontPath),
        loadImageData(sheetInfo.backPath),
      ]);
      return await this.importSheet(
        batchId,
        frontImageData.unsafeUnwrap(),
        backImageData.unsafeUnwrap(),
        sheetInfo.ballotAuditId
      );
    } finally {
      const end = Date.now();
      debug(
        'sheetAdded %s %s batchId=%s FINISHED in %dms',
        sheetInfo.frontPath,
        sheetInfo.backPath,
        batchId,
        Math.round(end - start)
      );
    }
  }

  async importSheet(
    batchId: string,
    frontInputImageData: ImageData,
    backInputImageData: ImageData,
    ballotAuditId?: string
  ): Promise<string> {
    let sheetId = uuid();
    const sheetInterpretation = await this.interpretSheet(sheetId, [
      frontInputImageData,
      backInputImageData,
    ]);

    const [{ imagePath: frontImagePath }, { imagePath: backImagePath }] =
      sheetInterpretation;
    let [
      { interpretation: frontInterpretation },
      { interpretation: backInterpretation },
    ] = sheetInterpretation;

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
      frontImagePath,
      frontInterpretation,
      backImagePath,
      backInterpretation,
      ballotAuditId
    );

    const batch = this.workspace.store.getBatch(batchId);
    await logScanSheetSuccess(this.logger, batch);

    return sheetId;
  }

  private async interpretSheet(
    sheetId: string,
    [frontImageData, backImageData]: SheetOf<ImageData>
  ): Promise<SheetOf<PageInterpretationWithFiles>> {
    const electionDefinition = this.getElectionDefinition();
    const { store } = this.workspace;
    const {
      allowOfficialBallotsInTestMode,
      disableVerticalStreakDetection,
      markThresholds,
      minimumDetectedBallotScaleOverride,
      maxCumulativeStreakWidth,
      retryStreakWidthThreshold,
    } = assertDefined(store.getSystemSettings());
    const { precincts } = electionDefinition.election;

    return await interpretSheetAndSaveImages(
      {
        electionDefinition,
        validPrecinctIds: new Set(precincts.map((p) => p.id)),
        testMode: store.getTestMode(),
        disableVerticalStreakDetection,
        adjudicationReasons: store.getAdjudicationReasons(),
        markThresholds,
        allowOfficialBallotsInTestMode,
        minimumDetectedScale:
          minimumDetectedBallotScaleOverride ??
          DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
        maxCumulativeStreakWidth,
        retryStreakWidthThreshold,
      },
      [frontImageData, backImageData],
      sheetId,
      this.workspace.ballotImagesPath
    );
  }

  /**
   * Add a sheet to the internal store.
   */
  private async addSheet(
    batchId: string,
    frontImagePath: string,
    frontInterpretation: PageInterpretation,
    backImagePath: string,
    backInterpretation: PageInterpretation,
    ballotAuditId?: string
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
            backImagePath,
            backInterpretation,
            frontImagePath,
            frontInterpretation,
            ballotAuditId
          );
        }
      }
    }

    const ballotId = this.workspace.store.addSheet(
      uuid(),
      batchId,
      [
        {
          imagePath: frontImagePath,
          interpretation: frontInterpretation,
        },
        {
          imagePath: backImagePath,
          interpretation: backInterpretation,
        },
      ],
      ballotAuditId
    );

    return ballotId;
  }

  private async finishBatch(error?: string): Promise<void> {
    const { currentBatch } = this;
    if (!currentBatch) {
      return;
    }
    this.currentBatch = undefined;
    this.inFlightInterpretations.clear();

    this.workspace.store.finishBatch({
      batchId: currentBatch.batchId,
      error,
    });
    const batch = this.workspace.store.getBatch(currentBatch.batchId);
    if (!error) {
      await logBatchComplete(this.logger, batch);
    }
    await currentBatch.sheetGenerator.endBatch();
    await fsExtra.remove(currentBatch.directory);
  }

  /**
   * Runs the scan-and-interpret pipeline for the current batch. The scanner
   * runs ahead of interpretation by up to {@link maxScanAhead} sheets.
   * Interpretation is fire-and-forget; the loop pauses when adjudication is
   * needed or when in-flight interpretations reach the limit.
   */
  private async runScanLoop(): Promise<void> {
    while (this.currentBatch) {
      const { currentBatch } = this;

      // Back-pressure: wait if too many in-flight interpretations
      while (this.inFlightInterpretations.size > this.maxScanAhead) {
        await Promise.race([...this.inFlightInterpretations]);
        if (this.interpretationError) break;
      }

      // Abort the batch if any interpretation failed
      if (this.interpretationError) {
        await this.failBatch(this.interpretationError);
        return;
      }

      // Pause if any sheet needs adjudication
      const adjudicationStatus = this.workspace.store.adjudicationStatus();
      if (adjudicationStatus.remaining > 0) {
        return;
      }

      // Scan next sheet
      const sheet = await currentBatch.sheetGenerator.scanSheet();

      if (!sheet) {
        debug(
          'no more sheets, waiting for %d in-flight interpretations',
          this.inFlightInterpretations.size
        );
        // Drain in-flight interpretations, bailing on first error
        while (this.inFlightInterpretations.size > 0) {
          await Promise.race([...this.inFlightInterpretations]);
          if (this.interpretationError) {
            await this.failBatch(this.interpretationError);
            return;
          }
        }
        // Check if any completed interpretation needs adjudication
        if (this.workspace.store.adjudicationStatus().remaining > 0) {
          return;
        }
        debug('closing batch %s', currentBatch.batchId);
        await this.finishBatch();
        return;
      }

      // Fire-and-forget interpretation — errors are recorded and checked
      // by the scan loop on its next iteration, centralizing batch
      // termination in a single code path.
      debug('got a ballot card: %o', sheet);
      const { batchId } = currentBatch;
      const promise: Promise<void> = this.interpretAndStore(sheet, batchId)
        .catch((error) => {
          const message = extractErrorMessage(error);
          debug('interpretation failed: %s', message);
          if (!this.interpretationError) {
            this.interpretationError = message;
          }
        })
        .finally(() => {
          this.inFlightInterpretations.delete(promise);
        });
      this.inFlightInterpretations.add(promise);
    }
  }

  private async failBatch(error: string): Promise<void> {
    void this.logger.logAsCurrentRole(LogEventId.ScanSheetComplete, {
      disposition: 'failure',
      message: `Processing sheet failed: ${error}`,
    });
    await this.finishBatch(error);
  }

  private async interpretAndStore(
    sheetInfo: ScannedSheetInfo,
    batchId: string
  ): Promise<void> {
    if (this.artificialInterpretDelayMs > 0 && NODE_ENV !== 'production') {
      await sleep(this.artificialInterpretDelayMs);
    }
    await this.sheetAdded(sheetInfo, batchId);
  }

  /**
   * Create a new batch and begin the scanning process
   */
  async startImport(): Promise<string> {
    if (this.isStartingBatch) {
      throw new Error('already starting import');
    }
    this.isStartingBatch = true;

    let batchId: Optional<Id>;
    let batchScanDirectory: Optional<string>;

    try {
      this.getElectionDefinition(); // ensure election definition is loaded
      const hasImprinter = await this.scanner.isImprinterAttached();

      if (this.currentBatch) {
        throw new Error('scanning already in progress');
      }

      this.logger.log(LogEventId.ImprinterStatus, 'system', {
        message: `Imprinter is ${hasImprinter ? 'attached' : 'not attached'}.`,
      });

      batchId = this.workspace.store.addBatch();
      batchScanDirectory = join(
        this.workspace.ballotImagesPath,
        `batch-${batchId}`
      );
      await fsExtra.ensureDir(batchScanDirectory);
      debug(
        'scanning starting for batch %s into %s',
        batchId,
        batchScanDirectory
      );
      const ballotPaperSize =
        this.workspace.store.getBallotPaperSizeForElection();
      const sheetGenerator = this.scanner.scanSheets({
        directory: batchScanDirectory,
        pageSize: ballotPaperSize,
        // If the imprinter is attached automatically imprint an ID prefixed by the batchID
        imprintIdPrefix: hasImprinter ? batchId : undefined,
      });

      this.currentBatch = {
        batchId,
        sheetGenerator,
        directory: batchScanDirectory,
      };
      this.startScanLoop();

      return batchId;
    } catch (error) {
      if (!this.currentBatch) {
        // Might have done some setup work, but didn't get to
        // `this.currentBatch = ...`. Clean up anything that would be a loose
        // end since `finishBatch` will bail without `currentBatch` set.
        if (typeof batchId !== 'undefined') {
          this.workspace.store.deleteBatch(batchId);
        }
        if (typeof batchScanDirectory !== 'undefined') {
          await fsExtra.remove(batchScanDirectory);
        }
      } else {
        await this.finishBatch(extractErrorMessage(error));
      }
      throw error;
    } finally {
      this.isStartingBatch = false;
    }
  }

  /**
   * Continue the existing scanning process
   */
  continueImport(options: { forceAccept: boolean }): void {
    if (!this.currentBatch) {
      throw new Error('no scanning job in progress');
    }

    const sheet = this.workspace.store.getNextAdjudicationSheet();

    if (sheet) {
      if (options.forceAccept) {
        this.workspace.store.adjudicateSheet(sheet.id);
      } else {
        this.workspace.store.deleteSheet(sheet.id);
      }
    }

    this.startScanLoop();
  }

  private startScanLoop(): void {
    this.interpretationError = undefined;
    this.scanLoopPromise = this.runScanLoop().catch(async (error) => {
      const message = extractErrorMessage(error);
      debug('scan loop failed: %s', message);
      await this.failBatch(message);
    });
  }

  /**
   * this is really for testing
   */
  async waitForEndOfBatchOrScanningPause(): Promise<void> {
    if (this.scanLoopPromise) {
      await this.scanLoopPromise;
    }
    await Promise.all([...this.inFlightInterpretations]);
  }

  /**
   * Reset all the data, both in the store and the ballot images.
   */
  async doZero(): Promise<void> {
    await this.logger.logAsCurrentRole(LogEventId.ClearingBallotData, {
      message: `Removing all ballot data...`,
    });
    this.workspace.resetElectionSession();
    await this.logger.logAsCurrentRole(LogEventId.ClearedBallotData, {
      disposition: 'success',
      message: 'Successfully cleared all ballot data.',
    });
  }

  /**
   * Get current batch and adjudication info.
   */
  getStatus(): ScanStatus {
    return {
      isScannerAttached: this.scanner.isAttached(),
      ongoingBatchId: this.currentBatch?.batchId,
      adjudicationsRemaining:
        this.workspace.store.adjudicationStatus().remaining,
      batches: this.workspace.store.getBatches(),
      canUnconfigure: this.workspace.store.getCanUnconfigure(),
    };
  }

  /**
   * Resets all data like `doZero`, removes election info, and stops importing.
   */
  async unconfigure(): Promise<void> {
    await this.doZero();
    this.workspace.store.reset(); // destroy all data
  }

  private getElectionDefinition(): ElectionDefinition {
    const electionRecord = this.workspace.store.getElectionRecord();

    if (!electionRecord) {
      throw new Error('no election configuration');
    }

    return electionRecord.electionDefinition;
  }
}
