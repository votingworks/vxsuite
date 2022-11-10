import {
  BallotLocale,
  BallotMark,
  BallotTargetMark,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
} from '@votingworks/types';
import { BallotStyleData } from '@votingworks/utils';

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

export interface BallotConfig extends BallotStyleData {
  filename: string;
  locales: BallotLocale;
  isLiveMode: boolean;
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

export function isMarginalMark(
  mark: BallotMark,
  markThresholds: MarkThresholds
): boolean {
  return getMarkStatus(mark, markThresholds) === MarkStatus.Marginal;
}
