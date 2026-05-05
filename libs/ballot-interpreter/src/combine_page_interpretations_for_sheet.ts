import {
  AdjudicationReason,
  AdjudicationReasonInfo,
  Election,
  InterpretedBmdMultiPagePage,
  InterpretedBmdPage,
  PageInterpretation,
  SheetInterpretation,
  SheetOf,
} from '@votingworks/types';
import { hasCrossoverVote } from '@votingworks/utils';

export function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretation>,
  election: Election
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.type;
  const backType = back.type;

  // Exactly one side can be printed on a BMD ballot (single-page).
  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    /* istanbul ignore next - @preserve */
    const interpretation = (
      front.type === 'InterpretedBmdPage' ? front : back
    ) as InterpretedBmdPage;

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
    const interpretation = (
      front.type === 'InterpretedBmdMultiPagePage' ? front : back
    ) as InterpretedBmdMultiPagePage;

    if (interpretation.adjudicationInfo.requiresAdjudication) {
      return {
        type: 'NeedsReviewSheet',
        reasons: [...interpretation.adjudicationInfo.enabledReasonInfos],
      };
    }

    return { type: 'ValidSheet' };
  }

  if (
    front.type === 'InterpretedHmpbPage' &&
    back.type === 'InterpretedHmpbPage'
  ) {
    const frontAdjudication = front.adjudicationInfo;
    const backAdjudication = back.adjudicationInfo;
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
          front.markInfo.marks.length === 0) &&
        (backReasons.some(
          (reason) => reason.type === AdjudicationReason.BlankBallot
        ) ||
          back.markInfo.marks.length === 0)
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
        ...front.votes,
        ...back.votes,
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
    (front.type === 'UnreadablePage' && front.reason === 'invalidScale') ||
    (back.type === 'UnreadablePage' && back.reason === 'invalidScale')
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'invalid_scale',
    };
  }

  if (
    (front.type === 'UnreadablePage' &&
      front.reason === 'bmdBallotScanningDisabled') ||
    (back.type === 'UnreadablePage' &&
      back.reason === 'bmdBallotScanningDisabled')
  ) {
    return {
      type: 'InvalidSheet',
      reason: 'bmd_ballot_scanning_disabled',
    };
  }

  if (
    (front.type === 'UnreadablePage' &&
      front.reason === 'verticalStreaksDetected') ||
    (back.type === 'UnreadablePage' &&
      back.reason === 'verticalStreaksDetected')
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
