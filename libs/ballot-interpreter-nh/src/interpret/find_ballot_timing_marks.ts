import {
  BallotCardGeometry,
  findTimingMarks,
  scanForTimingMarksByScoringBlocks,
} from '../accuvote';
import { Debugger } from '../debug';
import { PartialTimingMarks } from '../types';

/**
 * Finds timing marks in a ballot image.
 */
export function findBallotTimingMarks(
  imageData: ImageData,
  { geometry, debug }: { geometry: BallotCardGeometry; debug?: Debugger }
): PartialTimingMarks | undefined {
  const rects = scanForTimingMarksByScoringBlocks(imageData, {
    minimumScore: 0.75,
    debug,
  });
  return findTimingMarks({
    geometry,
    rects,
    debug,
  });
}
