import { float } from '@votingworks/image-utils';
import { MarkThresholds } from '@votingworks/types';

/**
 * Determines an appropriate class name for a ballot mark.
 */
export function markClassName(
  score: float,
  markThresholds: MarkThresholds
): string {
  return score < markThresholds.marginal / 10
    ? 'no-mark'
    : score < markThresholds.marginal / 2
    ? 'minimal-mark'
    : score < markThresholds.marginal
    ? 'submarginal-mark'
    : score < markThresholds.definite
    ? 'marginal-mark'
    : 'definite-mark';
}
