import {
  BallotTargetMark,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
} from '@votingworks/types';

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T;
  contestIds?: readonly string[];
}

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}

export function getMarkStatus(
  mark: BallotTargetMark,
  markThresholds: MarkThresholds
): MarkStatus {
  if (mark.score >= markThresholds.definite) {
    return MarkStatus.Marked;
  }

  if (mark.score >= markThresholds.marginal) {
    return MarkStatus.Marginal;
  }

  return MarkStatus.Unmarked;
}
