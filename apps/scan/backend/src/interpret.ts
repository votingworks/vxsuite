import {
  combinePageInterpretationsForSheet,
  InterpreterOptions,
  interpretSheetAndSaveImages,
} from '@votingworks/ballot-interpreter';
import { ok, Result } from '@votingworks/basics';
import {
  mapSheet,
  SheetInterpretationWithPages,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { rootDebug } from './util/debug';

export async function interpret(
  sheetId: string,
  sheet: SheetOf<ImageData>,
  options: InterpreterOptions & { ballotImagesPath: string }
): Promise<Result<SheetInterpretationWithPages, Error>> {
  const timer = time(rootDebug, `vxInterpret: ${sheetId}`);

  const pageInterpretations = await interpretSheetAndSaveImages(
    options,
    sheet,
    sheetId,
    options.ballotImagesPath
  );

  timer.end();

  return ok({
    ...combinePageInterpretationsForSheet(
      mapSheet(pageInterpretations, (p) => p.interpretation),
      options.electionDefinition.election
    ),
    pages: pageInterpretations,
  });
}

export type InterpretFn = typeof interpret;
