import {
  InterpreterOptions,
  interpretSheetAndSaveImages,
} from '@votingworks/ballot-interpreter';
import { ok, Result } from '@votingworks/basics';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  InterpretedBmdPage,
  PageInterpretationWithFiles,
  SheetInterpretation,
  SheetInterpretationWithPages,
  SheetOf,
} from '@votingworks/types';
import { time } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { rootDebug } from './util/debug';

export function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  // Exactly one side can be printed on a BMD ballot.
  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    const printedPage = frontType === 'InterpretedBmdPage' ? front : back;
    const interpretation = printedPage.interpretation as InterpretedBmdPage;

    if (interpretation.adjudicationInfo.requiresAdjudication) {
      return {
        type: 'NeedsReviewSheet',
        reasons: [...interpretation.adjudicationInfo.enabledReasonInfos],
      };
    }

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
    frontType === 'InvalidBallotHashPage' ||
    backType === 'InvalidBallotHashPage'
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_ballot_hash',
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

  if (
    (front.interpretation.type === 'UnreadablePage' &&
      front.interpretation.reason === 'verticalStreaksDetected') ||
    (back.interpretation.type === 'UnreadablePage' &&
      back.interpretation.reason === 'verticalStreaksDetected')
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'vertical_streaks_detected',
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
    ...combinePageInterpretationsForSheet(pageInterpretations),
    pages: pageInterpretations,
  });
}

export type InterpretFn = typeof interpret;
