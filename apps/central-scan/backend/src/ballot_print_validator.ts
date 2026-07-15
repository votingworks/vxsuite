import {
  type BallotPrintSideValidation,
  trim,
  validateBallotPrintSide,
} from '@votingworks/ballot-interpreter';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import {
  DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE,
  HmpbBallotPaperSize,
  SheetOf,
} from '@votingworks/types';

import { BatchScanner, ScannedSheetInfo } from './fujitsu_scanner';

export type { BallotPrintSideValidation };

export interface SheetPrintValidation {
  sheetNumber: number;
  front: BallotPrintSideValidation;
  back: BallotPrintSideValidation;
}

export type BallotPrintValidationState = 'idle' | 'scanning' | 'paused';

export interface BallotPrintValidationStatus {
  isScannerAttached: boolean;
  state: BallotPrintValidationState;
  sheetsValidated: number;
  invalidSheets: SheetPrintValidation[];
  pausedOnSheet?: SheetPrintValidation;
  pausedOnSheetImages?: SheetOf<string>;
}

async function imageToDataUrl(imagePath: string): Promise<string> {
  const imageData = (await loadImageData(imagePath)).unsafeUnwrap();
  const trimmedImageData = trim(imageData);
  return toDataUrl(trimmedImageData, 'image/jpeg');
}

async function mapSheetToDataUrls(
  sheet: ScannedSheetInfo
): Promise<SheetOf<string>> {
  return Promise.all([
    imageToDataUrl(sheet.frontPath),
    imageToDataUrl(sheet.backPath),
  ]);
}

function isSideValid(side: BallotPrintSideValidation): boolean {
  return (
    side.timingMarksDetected &&
    side.qrCodeDetected &&
    side.scale !== undefined &&
    side.scale >= DEFAULT_MINIMUM_DETECTED_BALLOT_SCALE
  );
}

/**
 * Validates printed ballots by scanning a stack and checking, for each sheet,
 * that timing marks and ballot QR codes can be read. Requires neither auth nor
 * an election package.
 */
export class BallotPrintValidator {
  private readonly scanner: BatchScanner;

  private state: BallotPrintValidationState = 'idle';
  private sheetsValidated = 0;
  private invalidSheets: SheetPrintValidation[] = [];
  private pausedOnSheet?: SheetPrintValidation;
  private pausedOnSheetImages?: SheetOf<string>;
  private resumeFromPause?: () => void;

  constructor({ scanner }: { scanner: BatchScanner }) {
    this.scanner = scanner;
  }

  getStatus(): BallotPrintValidationStatus {
    return {
      isScannerAttached: this.scanner.isAttached(),
      state: this.state,
      sheetsValidated: this.sheetsValidated,
      invalidSheets: this.invalidSheets,
      pausedOnSheet: this.pausedOnSheet,
      pausedOnSheetImages: this.pausedOnSheetImages,
    };
  }

  /**
   * Begins scanning and validating a stack, appending to any existing results.
   */
  start(): void {
    if (this.state !== 'idle') {
      return;
    }
    this.state = 'scanning';
    void this.run();
  }

  /**
   * Clears all validation results.
   */
  clear(): void {
    if (this.state !== 'idle') {
      return;
    }
    this.sheetsValidated = 0;
    this.invalidSheets = [];
  }

  /**
   * Acknowledges the bad sheet that the validator is paused on and resumes.
   */
  acknowledgeAndContinue(): void {
    this.resumeFromPause?.();
    this.resumeFromPause = undefined;
  }

  private async run(): Promise<void> {
    const batchControl = this.scanner.scanSheets({
      // Scan at the largest supported ballot size so that ballots of any
      // length are captured in full and their timing marks aren't cropped. The
      // validator doesn't know the election, so it can't look up the real
      // paper size.
      pageSize: HmpbBallotPaperSize.Custom22,
    });
    try {
      for (;;) {
        let sheet: ScannedSheetInfo | undefined;
        try {
          sheet = await batchControl.scanSheet();
        } catch {
          // Typically means the feeder is empty, which ends the batch.
          break;
        }
        if (!sheet) {
          break;
        }

        this.sheetsValidated += 1;
        const validation = this.validateSheet(sheet);

        if (!isSideValid(validation.front) || !isSideValid(validation.back)) {
          this.invalidSheets.push(validation);
          this.pausedOnSheet = validation;
          this.pausedOnSheetImages = await mapSheetToDataUrls(sheet);
          this.state = 'paused';
          await new Promise<void>((resolve) => {
            this.resumeFromPause = resolve;
          });
          this.pausedOnSheet = undefined;
          this.pausedOnSheetImages = undefined;
          this.state = 'scanning';
        }
      }
    } finally {
      await batchControl.endBatch();
      this.state = 'idle';
    }
  }

  private validateSheet(sheet: ScannedSheetInfo): SheetPrintValidation {
    return {
      sheetNumber: this.sheetsValidated,
      front: validateBallotPrintSide(sheet.frontPath),
      back: validateBallotPrintSide(sheet.backPath),
    };
  }
}
