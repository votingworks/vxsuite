import {
  AdjudicationReason,
  PageInterpretation,
  SheetOf,
} from '@votingworks/types';

/**
 * Determine if a sheet needs adjudication.
 */
export function sheetRequiresAdjudication([
  front,
  back,
]: SheetOf<PageInterpretation>): boolean {
  if (
    front.type === 'InterpretedBmdPage' ||
    back.type === 'InterpretedBmdPage'
  ) {
    return false;
  }

  const [frontRequiresAdjudicationNonBlank, backRequiresAdjudicationNonBlank] =
    [front, back].map(
      (pi) =>
        pi.type === 'UnreadablePage' ||
        pi.type === 'InvalidTestModePage' ||
        pi.type === 'InvalidElectionHashPage' ||
        pi.type === 'InvalidPrecinctPage' ||
        (pi.type === 'InterpretedHmpbPage' &&
          pi.adjudicationInfo.requiresAdjudication &&
          pi.adjudicationInfo.enabledReasonInfos.some(
            (reasonInfo) => reasonInfo.type !== AdjudicationReason.BlankBallot
          ))
    );

  // non-blank adjudication reasons are "dominant" traits: one page triggers adjudication
  if (frontRequiresAdjudicationNonBlank || backRequiresAdjudicationNonBlank) {
    return true;
  }

  // Always require adjudication of pairs with HMPB & something else.
  if (
    (front.type === 'InterpretedHmpbPage' &&
      back.type !== 'InterpretedHmpbPage') ||
    (back.type === 'InterpretedHmpbPage' &&
      front.type !== 'InterpretedHmpbPage')
  ) {
    return true;
  }

  const [frontIsBlankHmpbPage, backIsBlankHmpbPage] = [front, back].map(
    (pi) =>
      pi.type === 'BlankPage' || // truly blank page matters whether or not it's an adjudication reason.
      (pi.type === 'InterpretedHmpbPage' &&
        (pi.markInfo.marks.length === 0 || // no potential marks == automatic blank
          (pi.adjudicationInfo.requiresAdjudication &&
            pi.adjudicationInfo.enabledReasonInfos.some(
              (reasonInfo) => reasonInfo.type === AdjudicationReason.BlankBallot
            ))))
  );

  // blank-page adjudication is a "recessive" trait: both pages need to be blank to trigger
  if (frontIsBlankHmpbPage && backIsBlankHmpbPage) {
    return true;
  }

  return false;
}
