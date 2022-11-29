import { interpret } from '@votingworks/ballot-interpreter-nh';
import {
  ElectionDefinition,
  err,
  ok,
  PageInterpretationWithFiles,
  Result,
  SheetOf,
} from '@votingworks/types';
import { throwIllegalValue } from '@votingworks/utils';
import { VX_MACHINE_TYPE } from '../globals';
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

export async function call(input: Input): Promise<Output> {
  switch (input.action) {
    case 'configure': {
      const store = await Store.fileStore(input.dbPath);
      electionDefinition = store.getElectionDefinition();
      isTestMode = store.getTestMode();
      return;
    }

    case 'interpret': {
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
        VX_MACHINE_TYPE === 'bsd'
          ? electionDefinition.election.centralScanAdjudicationReasons
          : electionDefinition.election.precinctScanAdjudicationReasons;
      const result = await interpret(
        electionDefinition,
        [input.frontImagePath, input.backImagePath],
        { adjudicationReasons, isTestMode }
      );

      if (result.isErr()) {
        return result;
      }

      const [frontResult, backResult] = result.ok();

      const frontImages = await saveSheetImages(
        input.sheetId,
        input.ballotImagesPath,
        input.frontImagePath,
        frontResult.normalizedImage
      );
      const backImages = await saveSheetImages(
        input.sheetId,
        input.ballotImagesPath,
        input.backImagePath,
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

    default:
      throwIllegalValue(input, 'action');
  }
}
