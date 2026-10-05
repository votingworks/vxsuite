import { assert } from '@votingworks/basics';
import { SQUARE_GRID_UNIT_MM2 } from '@votingworks/types';
import type { ScoredPositionArea } from './bubble-ballot-ts/types.js';

/**
 * The ink in a scored write-in area in mm². The score is the inked fraction of
 * the area and the area's size comes from the timing-mark grid, so the result
 * does not depend on the scan's resolution.
 */
export function writeInAreaInkMm2(scoredArea: ScoredPositionArea): number {
  const { gridPosition, score } = scoredArea;
  assert(gridPosition.type === 'write-in');
  const { width, height } = gridPosition.writeInArea;
  return score * width * height * SQUARE_GRID_UNIT_MM2;
}
