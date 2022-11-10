import { PageInterpretation, SheetOf } from '@votingworks/types';

export enum Castability {
  Uncastable = 'Uncastable',
  CastableWithoutReview = 'CastableWithoutReview',
  CastableWithReview = 'CastableWithReview',
}

export function checkSheetCastability([
  front,
  back,
]: SheetOf<PageInterpretation>): Castability {
  if (
    (front.type === 'InterpretedBmdPage' && back.type === 'BlankPage') ||
    (front.type === 'BlankPage' && back.type === 'InterpretedBmdPage')
  ) {
    return Castability.CastableWithoutReview;
  }

  if (
    front.type === 'InterpretedHmpbPage' &&
    back.type === 'InterpretedHmpbPage'
  ) {
    if (
      front.adjudicationInfo.requiresAdjudication ||
      back.adjudicationInfo.requiresAdjudication
    ) {
      return Castability.CastableWithReview;
    }

    return Castability.CastableWithoutReview;
  }

  return Castability.Uncastable;
}
