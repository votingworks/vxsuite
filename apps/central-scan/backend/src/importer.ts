import { Result, assert, assertDefined, ok, sleep } from '@votingworks/basics';
import {
  ElectionDefinition,
  Id,
  PageInterpretation,
  PageInterpretationWithFiles,
  SheetOf,
} from '@votingworks/types';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
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
import { Workspace } from './util/workspace';
import {
  describeValidationError,
  validateSheetInterpretation,
} from './validation';
import { logBatchComplete, logScanSheetSuccess } from './util/logging';
import { ScanStatus } from './types';

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
    // Central scanner only uses all precinct mode, set on every configure
    this.workspace.store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
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
        frontImageData,
        backImageData,
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
    const interpretResult = await this.interpretSheet(sheetId, [
      frontInputImageData,
      backInputImageData,
    ]);

    if (interpretResult.isErr()) {
      throw interpretResult.err();
    }

    const [{ imagePath: frontImagePath }, { imagePath: backImagePath }] =
      interpretResult.ok();
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
  ): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>> {
    const electionDefinition = this.getElectionDefinition();
    const { store } = this.workspace;
    const {
      allowOfficialBallotsInTestMode,
      disableVerticalStreakDetection,
      markThresholds,
    } = assertDefined(store.getSystemSettings());

    return ok(
      await interpretSheetAndSaveImages(
        {
          electionDefinition,
          precinctSelection: ALL_PRECINCTS_SELECTION,
          testMode: store.getTestMode(),
          disableVerticalStreakDetection,
          adjudicationReasons: store.getAdjudicationReasons(),
          markThresholds,
          allowOfficialBallotsInTestMode,
        },
        [frontImageData, backImageData],
        sheetId,
        this.workspace.ballotImagesPath
      )
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

    this.workspace.store.finishBatch({
      batchId: currentBatch.batchId,
      error,
    });
    const batch = this.workspace.store.getBatch(currentBatch.batchId);
    await logBatchComplete(this.logger, batch);
    await currentBatch.sheetGenerator.endBatch();
    await fsExtra.remove(currentBatch.directory);
    this.currentBatch = undefined;
  }

  /**
   * Scan a single sheet and see how it looks
   */
  private async scanOneSheet(): Promise<void> {
    const { currentBatch } = this;
    assert(typeof currentBatch !== 'undefined');

    const sheet = await currentBatch.sheetGenerator.scanSheet();
    if (!sheet) {
      debug('closing batch %s', currentBatch.batchId);
      await this.finishBatch();
    } else {
      debug('got a ballot card: %o', sheet);
      const sheetId = await this.sheetAdded(sheet, currentBatch.batchId);
      debug('got a ballot card: %o, %s', sheet, sheetId);

      const adjudicationStatus = this.workspace.store.adjudicationStatus();
      if (adjudicationStatus.remaining === 0) {
        this.continueImport({ forceAccept: false });
      }
    }
  }

  /**
   * Create a new batch and begin the scanning process
   */
  async startImport(): Promise<string> {
    this.getElectionDefinition(); // ensure election definition is loaded
    const hasImprinter = await this.scanner.isImprinterAttached();

    if (this.currentBatch) {
      throw new Error('scanning already in progress');
    }

    const batchId = this.workspace.store.addBatch();
    const batchScanDirectory = join(
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
    this.continueImport({ forceAccept: false });

    return batchId;
  }

  /**
   * Continue the existing scanning process
   */
  continueImport(options: { forceAccept: boolean }): void {
    const sheet = this.workspace.store.getNextAdjudicationSheet();

    if (sheet) {
      if (options.forceAccept) {
        this.workspace.store.adjudicateSheet(sheet.id);
      } else {
        this.workspace.store.deleteSheet(sheet.id);
      }
    }

    if (this.currentBatch) {
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
    if (!this.currentBatch) {
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
