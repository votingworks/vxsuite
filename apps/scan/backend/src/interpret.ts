import {
  InterpreterOptions,
  interpretSheetAndSaveImages,
} from '@votingworks/ballot-interpreter';
import { ok, Result } from '@votingworks/basics';
import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Election,
  InterpretedBmdMultiPagePage,
  InterpretedBmdPage,
  PageInterpretationWithFiles,
  SheetInterpretation,
  SheetInterpretationWithPages,
  SheetOf,
} from '@votingworks/types';
import { hasCrossoverVote, time } from '@votingworks/utils';
import { ImageData } from 'canvas';
import { rootDebug } from './util/debug';

export function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>,
  election: Election
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  // Exactly one side can be printed on a BMD ballot (single-page).
  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    /* istanbul ignore next - @preserve */
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

  // Multi-page BMD ballot (one page of a multi-page ballot).
  if (
    (frontType === 'InterpretedBmdMultiPagePage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdMultiPagePage' && frontType === 'BlankPage')
  ) {
    /* istanbul ignore next - @preserve */
    const printedPage =
      frontType === 'InterpretedBmdMultiPagePage' ? front : back;
    const interpretation =
      printedPage.interpretation as InterpretedBmdMultiPagePage;

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
    const reasons: AdjudicationReasonInfo[] = [];

    if (
      frontAdjudication.requiresAdjudication ||
      backAdjudication.requiresAdjudication
    ) {
      const frontReasons = frontAdjudication.enabledReasonInfos;
      const backReasons = backAdjudication.enabledReasonInfos;

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
        reasons.push({ type: AdjudicationReason.BlankBallot });
      }
      // Otherwise, we can ignore blank sides
      else {
        reasons.push(
          ...[...frontReasons, ...backReasons].filter(
            (reason) => reason.type !== AdjudicationReason.BlankBallot
          )
        );
      }
    }

    // Crossover voting always triggers review in open primaries; it is not
    // gated on the configured adjudicationReasons.
    if (
      hasCrossoverVote(election, {
        ...front.interpretation.votes,
        ...back.interpretation.votes,
      })
    ) {
      reasons.push({ type: AdjudicationReason.CrossoverVoting });
    }

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
      front.interpretation.reason === 'invalidScale') ||
    (back.interpretation.type === 'UnreadablePage' &&
      back.interpretation.reason === 'invalidScale')
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_scale',
    };
  }

  if (
    (front.interpretation.type === 'UnreadablePage' &&
      front.interpretation.reason === 'bmdBallotScanningDisabled') ||
    (back.interpretation.type === 'UnreadablePage' &&
      back.interpretation.reason === 'bmdBallotScanningDisabled')
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'bmd_ballot_scanning_disabled',
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
    ...combinePageInterpretationsForSheet(
      pageInterpretations,
      options.electionDefinition.election
    ),
    pages: pageInterpretations,
  });
}

export type InterpretFn = typeof interpret;
