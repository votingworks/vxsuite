import {
  Id,
  PageInterpretationWithFiles,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import { saveSheetImage } from './save_images';
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
      const imagePath = await saveSheetImage({
        sheetId,
        side,
        ballotImagesPath,
        sourceImagePath: ballotImagePath,
        normalizedImage: result.normalizedImage,
      });
      return {
        interpretation: result.interpretation,
        imagePath,
      };
    }
  );
}
