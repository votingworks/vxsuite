import { QrCodePageResult } from '@votingworks/ballot-interpreter-vx';
import {
  Id,
  PageInterpretationWithFiles,
  SheetOf,
  mapSheet,
} from '@votingworks/types';
import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import {
  InterpretFileParams,
  Interpreter,
  InterpreterOptions,
} from '../interpreter';
import { saveSheetImages } from '../util/save_images';

const debug = makeDebug('scan:vx:interpret');

async function interpretPage(
  interpreter: Interpreter,
  ballotImagePath: string,
  sheetId: string,
  ballotImagesPath: string,
  detectQrcodeResult: QrCodePageResult
): Promise<PageInterpretationWithFiles> {
  debug('interpret ballot image: %s', ballotImagePath);
  assert(interpreter, 'interpreter not configured');

  const result = interpreter.interpretFile({
    ballotImagePath,
    detectQrcodeResult,
  });
  debug(
    'interpreted ballot image as %s: %s',
    result.interpretation.type,
    ballotImagePath
  );
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

export async function interpret(
  sheetId: Id,
  options: InterpreterOptions,
  files: SheetOf<InterpretFileParams>,
  ballotImagesPath: string
): Promise<SheetOf<PageInterpretationWithFiles>> {
  const innerInterpreter = new Interpreter({
    electionDefinition: options.electionDefinition,
    precinctSelection: options.precinctSelection,
    testMode: options.testMode,
    adjudicationReasons: options.adjudicationReasons,
  });
  return await mapSheet(files, async (file) =>
    interpretPage(
      innerInterpreter,
      file.ballotImagePath,
      sheetId,
      ballotImagesPath,
      file.detectQrcodeResult
    )
  );
}
