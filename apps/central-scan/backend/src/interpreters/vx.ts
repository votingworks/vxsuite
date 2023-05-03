import {
  Id,
  PageInterpretationWithFiles,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import { InterpreterOptions, interpretSheet } from '../interpret_sheet';
import { saveSheetImages } from '../util/save_images';

async function interpretSheetAndSaveImages(
  interpreterOptions: InterpreterOptions,
  sheet: SheetOf<string>,
  sheetId: string,
  ballotImagesPath: string
): Promise<SheetOf<PageInterpretationWithFiles>> {
  return mapSheet(
    await interpretSheet(interpreterOptions, sheet),
    async (result, side) => {
      const ballotImagePath = sheet[side === 'front' ? 0 : 1];
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
}

export async function interpret(
  sheetId: Id,
  options: InterpreterOptions,
  sheet: SheetOf<string>,
  ballotImagesPath: string
): Promise<SheetOf<PageInterpretationWithFiles>> {
  return interpretSheetAndSaveImages(options, sheet, sheetId, ballotImagesPath);
}
