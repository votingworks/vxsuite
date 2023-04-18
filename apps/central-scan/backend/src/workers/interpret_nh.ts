import { interpretCompatible } from '@votingworks/ballot-interpreter-nh-next';
import {
  ElectionDefinition,
  Id,
  PageInterpretationWithFiles,
  SheetOf,
} from '@votingworks/types';
import { throwIllegalValue, Result, err, ok } from '@votingworks/basics';
import { Store } from '../store';
import { saveSheetImages } from '../util/save_images';

export type Input =
  | { action: 'configure'; dbPath: string }
  | {
      action: 'interpret';
      interpreter: 'nh';
      sheetId: string;
      frontImagePath: string;
      backImagePath: string;
      ballotImagesPath: string;
    };

export type InterpretOutput = Result<
  SheetOf<PageInterpretationWithFiles>,
  Error
>;

export type Output = InterpretOutput | void;

let electionDefinition: ElectionDefinition | undefined;
let isTestMode: boolean | undefined;

export async function configure(dbPath: string): Promise<void> {
  const store = await Store.fileStore(dbPath);
  electionDefinition = store.getElectionDefinition();
  isTestMode = store.getTestMode();
}

export async function interpret(
  sheetId: Id,
  sheetPaths: SheetOf<string>,
  ballotImagesPath: string
): Promise<InterpretOutput> {
  if (!electionDefinition || isTestMode === undefined) {
    return err(
      new Error('cannot interpret ballot with no configured election')
    );
  }

  if (!electionDefinition.election.gridLayouts) {
    return err(
      new Error('cannot interpret ballot with no configured grid layouts')
    );
  }

  const adjudicationReasons =
    electionDefinition.election.centralScanAdjudicationReasons ?? [];
  const result = await interpretCompatible(electionDefinition, sheetPaths, {
    adjudicationReasons,
    isTestMode,
  });

  if (result.isErr()) {
    return result;
  }

  const [frontImagePath, backImagePath] = sheetPaths;
  const [frontResult, backResult] = result.ok();

  const frontImages = await saveSheetImages(
    sheetId,
    ballotImagesPath,
    frontImagePath,
    frontResult.normalizedImage
  );
  const backImages = await saveSheetImages(
    sheetId,
    ballotImagesPath,
    backImagePath,
    backResult.normalizedImage
  );

  const frontPageInterpretationWithFiles: PageInterpretationWithFiles = {
    interpretation: frontResult.interpretation,
    originalFilename: frontImages.original,
    normalizedFilename: frontImages.normalized,
  };
  const backPageInterpretationWithFiles: PageInterpretationWithFiles = {
    interpretation: backResult.interpretation,
    originalFilename: backImages.original,
    normalizedFilename: backImages.normalized,
  };

  return ok([
    frontPageInterpretationWithFiles,
    backPageInterpretationWithFiles,
  ]);
}

export async function call(input: Input): Promise<Output> {
  switch (input.action) {
    case 'configure': {
      await configure(input.dbPath);
      return;
    }

    case 'interpret': {
      return interpret(
        input.sheetId,
        [input.frontImagePath, input.backImagePath],
        input.ballotImagesPath
      );
    }

    default:
      throwIllegalValue(input, 'action');
  }
}
