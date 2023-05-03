import {
  Id,
  PageInterpretationWithFiles,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import { saveSheetImages } from './save_images';
import { InterpreterOptions, interpretSheet } from './interpret';

/**
 * Interpret a ballot sheet and save the images to their final storage location.
 */
export async function interpretSheetAndSaveImages(
  interpreterOptions: InterpreterOptions,
  sheet: SheetOf<string>,
  sheetId: Id,
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
