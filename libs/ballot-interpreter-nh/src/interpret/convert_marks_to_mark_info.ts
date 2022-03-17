import { MarkInfo } from '@votingworks/types';
import { BallotCardGeometry } from '../accuvote';
import { InterpretedOvalMark } from '../types';

/**
 * Convert a series of oval marks into mark info.
 */
export function convertMarksToMarkInfo(
  geometry: BallotCardGeometry,
  ovalMarks: readonly InterpretedOvalMark[]
): MarkInfo {
  return {
    ballotSize: geometry.canvasSize,
    marks: ovalMarks.map((mark) => {
      return {
        type: 'candidate',
        contestId: mark.gridPosition.contestId,
        optionId:
          mark.gridPosition.type === 'option'
            ? mark.gridPosition.optionId
            : `__write-in-${mark.gridPosition.writeInIndex}`,
        score: mark.score,
        bounds: mark.bounds,
        scoredOffset: mark.scoredOffset,
        // FIXME: Use real data here.
        target: {
          bounds: mark.bounds,
          inner: mark.bounds,
        },
      };
    }),
  };
}
