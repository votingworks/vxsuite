import {
  BallotLocales,
  BallotMark,
  BallotTargetMark,
  MarkAdjudications,
  MarkStatus,
  MarkThresholds,
  PageInterpretation,
} from '@votingworks/types';
import { BallotStyleData } from '@votingworks/utils';

export type SheetOf<T> = readonly [T, T];

/**
 * Helper for mapping sheet-wise data from one format to another.
 */
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T) => Promise<U>
): Promise<SheetOf<U>>;
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T) => U
): SheetOf<U>;
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T) => U
): SheetOf<U> | Promise<SheetOf<U>> {
  const front = fn(sheet[0]);
  const back = fn(sheet[1]);

  if (
    front &&
    back &&
    typeof (front as unknown as PromiseLike<U>).then === 'function' &&
    typeof (back as unknown as PromiseLike<U>).then === 'function'
  ) {
    return Promise.all([front, back]);
  }

  return [front, back];
}

export interface PageInterpretationWithAdjudication<
  T extends PageInterpretation = PageInterpretation
> {
  interpretation: T;
  contestIds?: readonly string[];
  markAdjudications?: MarkAdjudications;
}

export interface BallotPageQrcode {
  data: Uint8Array;
  position: 'top' | 'bottom';
}

export interface BallotConfig extends BallotStyleData {
  filename: string;
  locales: BallotLocales;
  isLiveMode: boolean;
}

export * from './types/ballot_review';

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

  if (
    mark.type === 'candidate' &&
    typeof mark.writeInTextScore === 'number' &&
    typeof markThresholds.writeInText === 'number' &&
    mark.writeInTextScore >= markThresholds.writeInText
  ) {
    return MarkStatus.UnmarkedWriteIn;
  }

  return MarkStatus.Unmarked;
}

export function isMarginalMark(
  mark: BallotMark,
  markThresholds: MarkThresholds
): boolean {
  return getMarkStatus(mark, markThresholds) === MarkStatus.Marginal;
}
