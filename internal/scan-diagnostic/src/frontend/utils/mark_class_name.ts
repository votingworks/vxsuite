import { BallotTargetMark, MarkThresholds } from '@votingworks/types';

/**
 * Determines an appropriate class name for a ballot mark.
 */
export function markClassName(
  mark: BallotTargetMark,
  markThresholds: MarkThresholds
): string {
  return mark.score < markThresholds.marginal / 10
    ? 'no-mark'
    : mark.score < markThresholds.marginal / 2
    ? 'minimal-mark'
    : mark.score < markThresholds.marginal
    ? 'submarginal-mark'
    : mark.score < markThresholds.definite
    ? 'marginal-mark'
    : 'definite-mark';
}
