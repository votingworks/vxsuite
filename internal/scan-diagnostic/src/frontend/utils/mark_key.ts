import { BallotTargetMark } from '@votingworks/types';

/**
 * Generates a unique key for a mark, suitable for use as a React key.
 */
export function markKey(mark: BallotTargetMark): string {
  return `${mark.contestId}-${mark.optionId}-${mark.bounds.x}-${mark.bounds.y}`;
}
