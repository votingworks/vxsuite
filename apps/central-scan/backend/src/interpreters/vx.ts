import {
  Id,
  PageInterpretationWithFiles,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import makeDebug from 'debug';
import {
  InterpretFileParams,
  InterpreterOptions,
  interpretFile,
} from '../interpreter';
import { saveSheetImages } from '../util/save_images';

const debug = makeDebug('scan:vx:interpret');

async function interpretPageAndSaveImages(
  interpreterOptions: InterpreterOptions,
  interpretFileParams: InterpretFileParams,
  sheetId: string,
  ballotImagesPath: string
): Promise<PageInterpretationWithFiles> {
  debug('interpret ballot image: %s', interpretFileParams.ballotImagePath);

  const result = interpretFile(interpreterOptions, interpretFileParams);
  debug(
    'interpreted ballot image as %s: %s',
    result.interpretation.type,
    interpretFileParams.ballotImagePath
  );
  const images = await saveSheetImages(
    sheetId,
    ballotImagesPath,
    interpretFileParams.ballotImagePath,
    result.normalizedImage
  );
  return {
    interpretation: result.interpretation,
    originalFilename: images.original,
    normalizedFilename: images.normalized,
  };
}

export async function interpret(
  sheetId: Id,
  options: InterpreterOptions,
  files: SheetOf<InterpretFileParams>,
  ballotImagesPath: string
): Promise<SheetOf<PageInterpretationWithFiles>> {
  return await mapSheet(files, async (file) =>
    interpretPageAndSaveImages(options, file, sheetId, ballotImagesPath)
  );
}
