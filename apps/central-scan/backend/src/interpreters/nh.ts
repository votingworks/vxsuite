import { interpretCompatible } from '@votingworks/ballot-interpreter-nh-next';
import { Result, assert, ok } from '@votingworks/basics';
import { Id, PageInterpretationWithFiles, SheetOf } from '@votingworks/types';
import { Store } from '../store';
import { saveSheetImages } from '../util/save_images';

export async function interpret(
  store: Store,
  sheetId: Id,
  sheetPaths: SheetOf<string>,
  ballotImagesPath: string
): Promise<Result<SheetOf<PageInterpretationWithFiles>, Error>> {
  const electionDefinition = store.getElectionDefinition();
  const isTestMode = store.getTestMode();

  assert(
    electionDefinition,
    'cannot interpret ballot with no configured election'
  );
  assert(
    electionDefinition.election.gridLayouts,
    'cannot interpret ballot with no configured grid layouts'
  );

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
