import { assertDefined } from '@votingworks/basics';
import type { Election, GridPositionWriteIn } from '@votingworks/types';
import type { Quadrilateral, ScoredPositionArea } from './bubble-ballot-ts/types.js';

/**
 * Values below this are a fraction of the election's median write-in area;
 * values at or above it are an absolute number of ink pixels at 200 dpi.
 */
export const WRITE_IN_AREA_THRESHOLD_ABSOLUTE_MINIMUM = 1;

/**
 * The median write-in area, in square grid units, across every write-in
 * position in the election. Undefined when the election has none.
 */
export function medianWriteInAreaGridUnits(
  election: Election
): number | undefined {
  const areas = election.ballotStyles
    .flatMap((ballotStyle) => ballotStyle.ballotPositions ?? [])
    .flatMap(([front, back]) => [...front, ...back])
    .flatMap((contest) => contest.options)
    .flatMap((option) =>
      option.type === 'write-in'
        ? [option.writeInArea.width * option.writeInArea.height]
        : []
    )
    .sort((a, b) => a - b);
  if (areas.length === 0) {
    return undefined;
  }
  const middle = Math.floor(areas.length / 2);
  const upper = assertDefined(areas[middle]);
  return areas.length % 2 === 1
    ? upper
    : (assertDefined(areas[middle - 1]) + upper) / 2;
}

/** Area of a quadrilateral in square pixels, via the shoelace formula. */
export function quadrilateralArea(shape: Quadrilateral): number {
  const { topLeft, topRight, bottomRight, bottomLeft } = shape;
  const edges = [
    [topLeft, topRight],
    [topRight, bottomRight],
    [bottomRight, bottomLeft],
    [bottomLeft, topLeft],
  ] as const;
  let twiceArea = 0;
  for (const [from, to] of edges) {
    twiceArea += from.x * to.y - to.x * from.y;
  }
  return Math.abs(twiceArea) / 2;
}

/**
 * Whether a scored write-in area holds enough ink to count as a write-in.
 *
 * A `threshold` below {@link WRITE_IN_AREA_THRESHOLD_ABSOLUTE_MINIMUM} is a
 * fraction of the election's median write-in area, so the same amount of ink
 * decides the question in every write-in area regardless of its size; on an
 * election whose write-in areas are all one size it is the fraction of each
 * area, as it always was. A threshold at or above that minimum is an absolute
 * number of ink pixels at 200 dpi.
 */
export function isWriteInAreaFilled({
  scoredArea,
  gridPosition,
  threshold,
  medianAreaGridUnits,
}: {
  scoredArea: ScoredPositionArea;
  gridPosition: GridPositionWriteIn;
  threshold: number;
  medianAreaGridUnits?: number;
}): boolean {
  if (threshold >= WRITE_IN_AREA_THRESHOLD_ABSOLUTE_MINIMUM) {
    return (
      scoredArea.score * quadrilateralArea(scoredArea.shape) >= threshold
    );
  }
  const { width, height } = gridPosition.writeInArea;
  const thisAreaGridUnits = width * height;
  const scaledThreshold =
    (threshold * (medianAreaGridUnits ?? thisAreaGridUnits)) /
    thisAreaGridUnits;
  return scoredArea.score >= scaledThreshold;
}
