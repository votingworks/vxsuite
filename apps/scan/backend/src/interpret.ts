import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  PageInterpretationWithFiles,
  SheetInterpretation,
  SheetInterpretationWithPages,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { ok, Result } from '@votingworks/basics';
import {
  interpretSheetAndSaveImages,
  InterpreterOptions,
} from '@votingworks/ballot-interpreter';
import { rootDebug } from './util/debug';

export function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InterpretedHmpbPage' &&
    backType === 'InterpretedHmpbPage'
  ) {
    const frontAdjudication = front.interpretation.adjudicationInfo;
    const backAdjudication = back.interpretation.adjudicationInfo;

    if (
      !(
        frontAdjudication.requiresAdjudication ||
        backAdjudication.requiresAdjudication
      )
    ) {
      return { type: 'ValidSheet' };
    }

    const frontReasons = frontAdjudication.enabledReasonInfos;
    const backReasons = backAdjudication.enabledReasonInfos;

    let reasons: AdjudicationReasonInfo[];
    // If both sides are blank, the ballot is blank
    if (
      (frontReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      ) ||
        front.interpretation.markInfo.marks.length === 0) &&
      (backReasons.some(
        (reason) => reason.type === AdjudicationReason.BlankBallot
      ) ||
        back.interpretation.markInfo.marks.length === 0)
    ) {
      reasons = [{ type: AdjudicationReason.BlankBallot }];
    }
    // Otherwise, we can ignore blank sides
    else {
      reasons = [...frontReasons, ...backReasons].filter(
        (reason) => reason.type !== AdjudicationReason.BlankBallot
      );
    }

    // If there are any non-blank reasons, they should be reviewed
    if (reasons.length > 0) {
      return {
        type: 'NeedsReviewSheet',
        reasons,
      };
    }
    return { type: 'ValidSheet' };
  }

  if (
    frontType === 'InvalidElectionHashPage' ||
    backType === 'InvalidElectionHashPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_election_hash',
    };
  }

  if (
    frontType === 'InvalidTestModePage' ||
    backType === 'InvalidTestModePage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_test_mode',
    };
  }

  if (
    frontType === 'InvalidPrecinctPage' ||
    backType === 'InvalidPrecinctPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_precinct',
    };
  }

  if (frontType === 'UnreadablePage' || backType === 'UnreadablePage') {
    return {
      type: 'InvalidSheet',
      reason: 'unreadable',
    };
  }

  return {
    type: 'InvalidSheet',
    reason: 'unknown',
  };
}

export async function interpret(
  sheetId: string,
  sheet: SheetOf<string>,
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
    ...combinePageInterpretationsForSheet(pageInterpretations),
    pages: pageInterpretations,
  });
}

export type InterpretFn = typeof interpret;
