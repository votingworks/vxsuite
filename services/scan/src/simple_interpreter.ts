import { interpret as interpretNh } from '@votingworks/ballot-interpreter-nh';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  BallotPageLayoutWithImage,
  ElectionDefinition,
  Id,
  ok,
  PageInterpretationWithFiles,
  Result,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { interpretTemplate } from '@votingworks/ballot-interpreter-vx';
import { Scan } from '@votingworks/api';
import * as qrcodeWorker from './workers/qrcode';
import { Interpreter as VxInterpreter } from './interpreter';
import { mapSheet, SheetOf } from './types';
import { saveSheetImages } from './util/save_images';
import { ScannerLocation, SCANNER_LOCATION } from './globals';
import { Store } from './store';
import { pdfToImages } from './util/pdf_to_images';

export interface CreateInterpreterOptions {
  readonly electionDefinition: ElectionDefinition;
  readonly layouts: readonly BallotPageLayoutWithImage[];
  readonly ballotImagesPath: string;
  readonly testMode: boolean;
}

export type SheetInterpretation = Scan.SheetInterpretation & {
  pages: SheetOf<PageInterpretationWithFiles>;
};

/**
 * Provides a simple interface for interpreting a sheet of ballot paper.
 */
export interface SimpleInterpreter {
  interpret(
    sheetId: Id,
    sheet: SheetOf<string>
  ): Promise<Result<SheetInterpretation, Error>>;
}

function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>
): Scan.SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InterpretedHmpbPage' &&
    backType === 'InterpretedHmpbPage'
  ) {
    const frontAdjudication = front.interpretation.adjudicationInfo;
    const backAdjudication = back.interpretation.adjudicationInfo;

    if (
      !(
        frontAdjudication.requiresAdjudication ||
        backAdjudication.requiresAdjudication
      )
    ) {
      return { type: 'ValidSheet' };
    }

    const frontReasons = frontAdjudication.enabledReasonInfos;
    const backReasons = backAdjudication.enabledReasonInfos;

    let reasons: AdjudicationReasonInfo[];
    // If both sides are blank, the ballot is blank
    if (
      frontReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      ) &&
      backReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      )
    ) {
      reasons = [{ type: AdjudicationReason.BlankBallot }];
    }
    // Otherwise, we can ignore blank sides
    else {
      reasons = [...frontReasons, ...backReasons].filter(
        (reason) => reason.type !== AdjudicationReason.BlankBallot
      );
    }

    // If there are any non-blank reasons, they should be reviewed
    if (reasons.length > 0) {
      return {
        type: 'NeedsReviewSheet',
        reasons,
      };
    }
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InvalidElectionHashPage' ||
    backType === 'InvalidElectionHashPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_election_hash',
    };
  }

  if (
    frontType === 'InvalidTestModePage' ||
    backType === 'InvalidTestModePage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_test_mode',
    };
  }

  if (
    frontType === 'InvalidPrecinctPage' ||
    backType === 'InvalidPrecinctPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };
  }

  if (frontType === 'UnreadablePage' || backType === 'UnreadablePage') {
    return {
      type: 'InvalidSheet',
      reason: 'unreadable',
    };
  }

  if (
    frontType === 'UninterpretedHmpbPage' ||
    backType === 'UninterpretedHmpbPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'unknown',
    };
  }

  return {
    type: 'InvalidSheet',
    reason: 'unknown',
  };
}

function createNhInterpreter(
  options: CreateInterpreterOptions
): SimpleInterpreter {
  const { electionDefinition, ballotImagesPath } = options;
  return {
    interpret: async (sheetId, sheet) => {
      const result = await interpretNh(electionDefinition, sheet);

      if (result.isErr()) {
        return result;
      }

      const [frontResult, backResult] = result.ok();

      const frontImages = await saveSheetImages(
        sheetId,
        ballotImagesPath,
        sheet[0],
        frontResult.normalizedImage
      );
      const backImages = await saveSheetImages(
        sheetId,
        ballotImagesPath,
        sheet[1],
        backResult.normalizedImage
      );
      const pageInterpretations: SheetOf<PageInterpretationWithFiles> = [
        {
          interpretation: frontResult.interpretation,
          originalFilename: frontImages.original,
          normalizedFilename: frontImages.normalized,
        },
        {
          interpretation: backResult.interpretation,
          originalFilename: backImages.original,
          normalizedFilename: backImages.normalized,
        },
      ];
      return ok({
        pages: pageInterpretations,
        ...combinePageInterpretationsForSheet(pageInterpretations),
      });
    },
  };
}

function createVxInterpreter({
  electionDefinition,
  ballotImagesPath,
  layouts,
  testMode,
}: CreateInterpreterOptions): SimpleInterpreter {
  const vxInterpreter = new VxInterpreter({
    electionDefinition,
    testMode,
    adjudicationReasons:
      (SCANNER_LOCATION === ScannerLocation.Central
        ? electionDefinition.election.centralScanAdjudicationReasons
        : electionDefinition.election.precinctScanAdjudicationReasons) ?? [],
  });

  for (const layout of layouts) {
    vxInterpreter.addHmpbTemplate(layout);
  }

  return {
    interpret: async (sheetId, [frontPath, backPath]) => {
      const [frontQrcodeOutput, backQrcodeOutput] =
        qrcodeWorker.normalizeSheetOutput(
          electionDefinition,
          await mapSheet(
            [frontPath, backPath],
            qrcodeWorker.detectQrcodeInFilePath
          )
        );
      const pageInterpretations = await mapSheet(
        [
          [frontPath, frontQrcodeOutput],
          [backPath, backQrcodeOutput],
        ] as const,
        async ([
          ballotImagePath,
          detectQrcodeResult,
        ]): Promise<PageInterpretationWithFiles> => {
          const ballotImageFile = await readFile(ballotImagePath);
          const result = await vxInterpreter.interpretFile({
            ballotImagePath,
            ballotImageFile,
            detectQrcodeResult,
          });

          const images = await saveSheetImages(
            sheetId,
            ballotImagesPath,
            ballotImagePath,
            result.normalizedImage
          );

          return {
            interpretation: result.interpretation,
            originalFilename: images.original,
            normalizedFilename: images.normalized,
          };
        }
      );
      return ok({
        pages: pageInterpretations,
        ...combinePageInterpretationsForSheet(pageInterpretations),
      });
    },
  };
}

/**
 * Loads ballot layouts from the {@link Store} suitable for passing to {@link
 * createInterpreter}. The results may be cached and used again as long as the
 * underlying HMPB templates are not modified.
 */
export async function loadLayouts(
  store: Store
): Promise<BallotPageLayoutWithImage[] | undefined> {
  const electionDefinition = store.getElectionDefinition();

  if (!electionDefinition) {
    return;
  }

  const templates = store.getHmpbTemplates();
  const loadedLayouts: BallotPageLayoutWithImage[] = [];

  for (const [pdf, layouts] of templates) {
    for await (const { page, pageNumber } of pdfToImages(pdf, { scale: 2 })) {
      const ballotPageLayout = layouts[pageNumber - 1];
      loadedLayouts.push(
        await interpretTemplate({
          electionDefinition,
          imageData: page,
          metadata: ballotPageLayout.metadata,
        })
      );
    }
  }

  return loadedLayouts;
}

/**
 * Creates an interpreter with the given options. Use {@link loadLayouts} to
 * load ballot layouts from the {@link Store}.
 */
export function createInterpreter(
  options: CreateInterpreterOptions
): SimpleInterpreter {
  if (options.electionDefinition.election.gridLayouts) {
    return createNhInterpreter(options);
  }

  return createVxInterpreter(options);
}

/**
 * Stores an interpreted sheet of ballot paper in the {@link Store}, returning
 * the effective sheet ID.
 */
export function storeInterpretedSheet(
  store: Store,
  sheetId: Id,
  sheet: SheetOf<PageInterpretationWithFiles>
): Id {
  // TODO instead of one batch per ballot, use one batch per scanning session
  // (e.g. from polls open to polls close)
  const batchId = store.addBatch();
  const addedSheetId = store.addSheet(sheetId, batchId, sheet);
  store.finishBatch({ batchId });
  return addedSheetId;
}
