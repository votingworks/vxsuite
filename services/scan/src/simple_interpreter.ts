import { interpret as interpretNh } from '@votingworks/ballot-interpreter-nh';
import {
  BallotPageLayoutWithImage,
  ElectionDefinition,
  Id,
  ok,
  PageInterpretationWithFiles,
  Result,
} from '@votingworks/types';
import { readFile } from 'fs/promises';
import { interpretTemplate } from '@votingworks/ballot-interpreter-vx';
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

/**
 * Provides a simple interface for interpreting a sheet of ballot paper.
 */
export interface SimpleInterpreter {
  interpret(
    sheetId: Id,
    sheet: SheetOf<string>
  ): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>>;
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

      return ok([
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
      ]);
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
      return ok(
        await mapSheet(
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
        )
      );
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

export function deleteInterpretedSheet(store: Store, sheetId: Id): void {
  store.deleteSheet(sheetId);
}
