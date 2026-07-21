import {
  assert,
  assertDefined,
  extractErrorMessage,
  ok,
  Optional,
  sleep,
} from '@votingworks/basics';
import {
  DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
  ElectionDefinition,
  Id,
  PageInterpretation,
  PageInterpretationWithFiles,
  pollingPlaceFromElection,
  pollingPlacePrecinctIds,
  PrecinctId,
  SheetOf,
} from '@votingworks/types';
import makeDebug from 'debug';
import * as fsExtra from 'fs-extra';
import { join } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import { interpretSheetAndSaveImages } from '@votingworks/ballot-interpreter';
import { LogEventId, Logger } from '@votingworks/logging';
import { ImageData } from 'canvas';
import { loadImageData } from '@votingworks/image-utils';
import {
  BatchControl,
  BatchScanner,
  ScannedSheetInfo,
} from './fujitsu_scanner';
import { Workspace } from './util/workspace';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';
import {
  logBatchComplete,
  logScanSheetSuccess,
  logSheetAdjudicationInfo,
} from './util/logging';
import { BatchPauseReason, ScanStatus } from './types';

const debug = makeDebug('scan:importer');
export interface Options {
  workspace: Workspace;
  scanner: BatchScanner;
  logger: Logger;
}

interface CurrentBatch {
  /**
   * The ID of the current batch being scanned.
   */
  batchId: Id;

  /**
   * The scanner control object for the current batch. Replaced with a fresh
   * control when a paused batch is continued.
   */
  sheetGenerator: BatchControl;

  /**
   * The working directory for `sheetGenerator`, where scanned images are placed
   * before being interpreted. This directory is removed when the batch is
   * finished.
   */
  directory: string;

  /**
   * The imprint prefix used when the batch was started, so continuing the
   * batch imprints with the same prefix.
   */
  imprintIdPrefix?: string;

  /**
   * Whether the batch is actively scanning or paused. A paused batch stays
   * open until the operator continues, saves, or cancels it.
   */
  state: 'scanning' | 'paused';

  /**
   * Why the batch is paused, when `state` is `'paused'`.
   */
  pauseReason?: BatchPauseReason;

  /**
   * Set when the operator asks to stop scanning; the scan loop observes this
   * after the in-flight sheet and pauses the batch.
   */
  stopRequested: boolean;

  /**
   * The precinct of the first readable ballot in the batch. Batches are
   * organized by precinct, so later ballots from a different precinct are
   * stopped for adjudication.
   */
  expectedPrecinctId?: PrecinctId;
}

function interpretationPrecinctId(
  interpretation: PageInterpretation
): Optional<PrecinctId> {
  return interpretation.type === 'InterpretedBmdPage' ||
    interpretation.type === 'InterpretedHmpbPage'
    ? interpretation.metadata.precinctId
    : undefined;
}

function asInvalidPrecinctPage(
  interpretation: PageInterpretation
): PageInterpretation {
  return interpretation.type === 'InterpretedBmdPage' ||
    interpretation.type === 'InterpretedHmpbPage'
    ? { type: 'InvalidPrecinctPage', metadata: interpretation.metadata }
    : interpretation;
}

/**
 * Imports ballot images from a `Scanner` and stores them in a `Store`.
 */
export class Importer {
  private readonly workspace: Workspace;
  private readonly scanner: BatchScanner;
  private readonly logger: Logger;
  private isStartingBatch = false;
  private currentBatch?: CurrentBatch;

  constructor({ workspace, scanner, logger }: Options) {
    this.workspace = workspace;
    this.scanner = scanner;
    this.logger = logger;
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
        sheetInfo.front,
        sheetInfo.back,
        batchId
      );
      const [frontImageData, backImageData] = await Promise.all([
        // The `ImageData` arms are only taken by the push-streaming DeskPro
        // scanner (PoC), which hands back decoded images rather than file paths.
        /* istanbul ignore start */
        typeof sheetInfo.front === 'string'
          ? loadImageData(sheetInfo.front)
          : ok(sheetInfo.front),
        typeof sheetInfo.back === 'string'
          ? loadImageData(sheetInfo.back)
          : ok(sheetInfo.back),
        /* istanbul ignore stop */
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
        sheetInfo.front,
        sheetInfo.back,
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
    let sheetId: string = uuid();
    const electionDefinition = this.getElectionDefinition();
    const sheetInterpretation = await this.interpretSheet(
      electionDefinition,
      sheetId,
      [frontInputImageData, backInputImageData]
    );

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

    // Batches are organized by precinct: the first readable ballot sets the
    // batch's precinct, and any later ballot from a different precinct is
    // stopped for adjudication so the operator can pull it out.
    const { currentBatch } = this;
    const precinctId =
      interpretationPrecinctId(frontInterpretation) ??
      interpretationPrecinctId(backInterpretation);
    if (currentBatch?.batchId === batchId && precinctId) {
      if (!currentBatch.expectedPrecinctId) {
        currentBatch.expectedPrecinctId = precinctId;
      } else if (precinctId !== currentBatch.expectedPrecinctId) {
        debug(
          'rejecting sheet from precinct %s: batch precinct is %s',
          precinctId,
          currentBatch.expectedPrecinctId
        );
        frontInterpretation = asInvalidPrecinctPage(frontInterpretation);
        backInterpretation = asInvalidPrecinctPage(backInterpretation);
      }
    }

    sheetId = await this.addSheet(
      electionDefinition,
      batchId,
      frontImagePath,
      frontInterpretation,
      backImagePath,
      backInterpretation,
      ballotAuditId
    );

    await logSheetAdjudicationInfo(this.logger, [
      frontInterpretation,
      backInterpretation,
    ]);

    const batch = this.workspace.store.getBatch(batchId);
    await logScanSheetSuccess(this.logger, batch);

    return sheetId;
  }

  private async interpretSheet(
    electionDefinition: ElectionDefinition,
    sheetId: string,
    [frontImageData, backImageData]: SheetOf<ImageData>
  ): Promise<SheetOf<PageInterpretationWithFiles>> {
    const { store } = this.workspace;
    const {
      allowOfficialBallotsInTestMode,
      disableVerticalStreakDetection,
      markThresholds,
      minimumDetectedBallotScaleOverride,
      maxCumulativeStreakWidth,
      retryStreakWidthThreshold,
    } = assertDefined(store.getSystemSettings());

    const pollingPlaceId = assertDefined(store.getPollingPlaceId());
    return await interpretSheetAndSaveImages(
      {
        electionDefinition,
        validPrecinctIds: pollingPlacePrecinctIds(
          pollingPlaceFromElection(electionDefinition.election, pollingPlaceId)
        ),
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
    electionDefinition: ElectionDefinition,
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
            electionDefinition,
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
      electionDefinition.election,
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
   * Pause the current batch without finishing it: halt the physical feed and
   * release the underlying scan session. The batch stays open until the
   * operator continues, saves, or cancels it.
   */
  private async pauseBatch(reason: BatchPauseReason): Promise<void> {
    const { currentBatch } = this;
    assert(typeof currentBatch !== 'undefined');
    debug('pausing batch %s: %s', currentBatch.batchId, reason);
    currentBatch.state = 'paused';
    currentBatch.pauseReason = reason;
    currentBatch.stopRequested = false;
    // For pull-driven scanners ending the session is enough to halt the feed.
    // The push-streaming DeskPro additionally drops the buffered sheets that
    // coasted out after the last counted one and logs reload guidance for the
    // operator. (The `pauseFeeding` call is a PoC DeskPro-only hook;
    // pull-driven scanners used in tests don't define it.)
    /* istanbul ignore start */
    await currentBatch.sheetGenerator.pauseFeeding?.();
    /* istanbul ignore stop */
    await currentBatch.sheetGenerator.endBatch();
    await this.logger.logAsCurrentRole(LogEventId.ScanBatchContinue, {
      disposition: 'success',
      message: `Batch ${currentBatch.batchId} paused (${reason}).`,
      batchId: currentBatch.batchId,
      pauseReason: reason,
    });
  }

  /**
   * Scan a single sheet and see how it looks
   */
  private async scanOneSheet(): Promise<void> {
    const { currentBatch } = this;
    assert(typeof currentBatch !== 'undefined');

    const sheet = await currentBatch.sheetGenerator.scanSheet();
    if (!sheet) {
      await this.pauseBatch(
        currentBatch.stopRequested ? 'stopped' : 'tray-empty'
      );
      return;
    }

    debug('got a ballot card: %o', sheet);
    const sheetId = await this.sheetAdded(sheet, currentBatch.batchId);
    debug('got a ballot card: %o, %s', sheet, sheetId);

    if (this.workspace.store.adjudicationsRemaining() > 0) {
      // The sheet needs review. Halt the feed and pause the batch; once the
      // operator resolves the sheet (see `continueImport`) the batch stays
      // paused until they explicitly continue, save, or cancel it.
      await this.pauseBatch('ballot-review');
    } else if (currentBatch.stopRequested) {
      await this.pauseBatch('stopped');
    } else {
      this.scanNextSheet();
    }
  }

  /**
   * Kick off scanning the next sheet, pausing the batch on failure.
   */
  private scanNextSheet(): void {
    this.scanOneSheet().catch(async (error) => {
      const message = extractErrorMessage(error);
      debug('processing sheet failed with error: %s', message);
      void this.logger.logAsCurrentRole(LogEventId.ScanSheetComplete, {
        disposition: 'failure',
        message: `Processing sheet failed: ${message}`,
      });
      try {
        // Pause rather than finish the batch: an error (e.g. a failure to
        // open a fresh scanner session when continuing a batch) must not take
        // the in-progress batch away from the operator. They can retry with
        // "Continue Scanning", or save or cancel what was scanned so far.
        await this.pauseBatch('error');
      } catch (pauseError) {
        debug(
          'pausing batch after error failed: %s',
          extractErrorMessage(pauseError)
        );
        // Last resort: end the batch, recording the original error.
        void this.finishBatch(message).catch((finishError) => {
          void this.logger.logAsCurrentRole(LogEventId.ScanBatchComplete, {
            disposition: 'failure',
            message: `Additionally, finishing batch failed: ${extractErrorMessage(
              finishError
            )}`,
          });
        });
      }
    });
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
        imprintIdPrefix: hasImprinter ? batchId : undefined,
        state: 'scanning',
        stopRequested: false,
      };
      this.scanNextSheet();

      return batchId;
    } catch (error) {
      // Only unwind state created by this call; a pre-existing batch (e.g. a
      // paused one when the operator tries to start another) must be left
      // untouched.
      if (this.currentBatch && this.currentBatch.batchId === batchId) {
        await this.finishBatch(extractErrorMessage(error));
      } else {
        // Might have done some setup work, but didn't get to
        // `this.currentBatch = ...`. Clean up anything that would be a loose
        // end since `finishBatch` will bail without `currentBatch` set.
        if (typeof batchId !== 'undefined') {
          this.workspace.store.deleteBatch(batchId);
        }
        if (typeof batchScanDirectory !== 'undefined') {
          await fsExtra.remove(batchScanDirectory);
        }
      }
      throw error;
    } finally {
      this.isStartingBatch = false;
    }
  }

  /**
   * Resolve the sheet currently under review. The batch stays paused
   * afterwards; the operator continues, saves, or cancels it explicitly.
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
  }

  /**
   * Resume scanning a paused batch, appending newly loaded sheets to it via a
   * fresh scanner session.
   */
  continueBatch(): void {
    const { currentBatch } = this;
    if (!currentBatch || currentBatch.state !== 'paused') {
      throw new Error('no paused batch');
    }
    if (this.workspace.store.adjudicationsRemaining() > 0) {
      throw new Error('cannot continue batch with a sheet pending review');
    }

    const ballotPaperSize =
      this.workspace.store.getBallotPaperSizeForElection();
    currentBatch.sheetGenerator = this.scanner.scanSheets({
      directory: currentBatch.directory,
      pageSize: ballotPaperSize,
      imprintIdPrefix: currentBatch.imprintIdPrefix,
    });
    currentBatch.state = 'scanning';
    currentBatch.pauseReason = undefined;
    this.scanNextSheet();
  }

  /**
   * Finalize a paused batch, making it ready for CVR export.
   */
  async saveBatch(): Promise<void> {
    const { currentBatch } = this;
    if (!currentBatch || currentBatch.state !== 'paused') {
      throw new Error('no paused batch');
    }
    if (this.workspace.store.adjudicationsRemaining() > 0) {
      throw new Error('cannot save batch with a sheet pending review');
    }

    await this.finishBatch();
  }

  /**
   * Discard the current batch and all its scanned sheets, like deleting a
   * saved batch. If the batch is actively scanning, the physical feed is
   * halted first and any in-flight sheet is discarded with the rest.
   */
  async cancelBatch(): Promise<void> {
    const { currentBatch } = this;
    if (!currentBatch) {
      throw new Error('no batch in progress');
    }

    if (currentBatch.state === 'scanning') {
      // Halt the physical feed and wait for the scan loop to drain the
      // in-flight sheet and pause.
      currentBatch.stopRequested = true;
      await currentBatch.sheetGenerator.endBatch();
      await this.waitForEndOfBatchOrScanningPause();

      // The scan loop may have ended the batch while we waited (last-resort
      // error handling); in that case there is nothing left to cancel.
      /* istanbul ignore next - timing-dependent race */
      if (this.currentBatch !== currentBatch) {
        throw new Error('batch already ended');
      }
    }

    this.currentBatch = undefined;

    // Discarding removes the batch outright — its sheets (including any
    // awaiting review) cascade, and its batch number is freed so the next
    // batch reuses it. A discarded batch never got a label sticker, so its
    // number was never consumed.
    this.workspace.store.discardBatch(currentBatch.batchId);
    await fsExtra.remove(currentBatch.directory);
  }

  /**
   * Wait until the current batch is no longer actively scanning (it paused or
   * finished). Used by `cancelBatch` and by tests.
   */
  async waitForEndOfBatchOrScanningPause(): Promise<void> {
    while (this.currentBatch?.state === 'scanning') {
      await sleep(200);
    }
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
      currentBatch: this.currentBatch && {
        batchId: this.currentBatch.batchId,
        state: this.currentBatch.state,
        pauseReason: this.currentBatch.pauseReason,
      },
      adjudicationsRemaining: this.workspace.store.adjudicationsRemaining(),
      batches: this.workspace.store.getBatches(),
      nextBatchNumber: this.workspace.store.getNextBatchNumber(),
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
