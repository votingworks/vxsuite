import { assert, err, find, groupBy, ok, Result } from '@votingworks/basics';
import {
  BallotMetadata,
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotPageLayout,
  CandidateContest,
  Election,
} from '@votingworks/types';
import { allContestOptions } from '@votingworks/shared';
import { getScannedBallotCardGeometry } from './accuvote';
import { computeTimingMarkGrid } from './timing_marks';
import {
  BallotCardGeometry,
  CompleteTimingMarks,
  Point,
  Rect,
  Size,
  Vector,
} from './types';
import { makeRect, vec } from './utils';

function timingMarkAt(x: number, y: number, timingMarkSize: Size): Rect {
  return makeRect({
    minX: x,
    minY: y,
    maxX: x + timingMarkSize.width - 1,
    maxY: y + timingMarkSize.height - 1,
  });
}

/**
 * Generates a timing mark layout for a ballot card geometry.
 */
export function layoutTimingMarksForGeometry({
  contentArea,
  gridSize,
  timingMarkSize,
}: BallotCardGeometry): CompleteTimingMarks {
  const timingMarkGapSize: Size = {
    width: timingMarkSize.height,
    height: timingMarkSize.width,
  };
  const maximumHorizontalTimingMarkCount = gridSize.width;
  const maximumVerticalTimingMarkCount = gridSize.height;

  assert(
    maximumHorizontalTimingMarkCount > 1,
    `the ballot card is too small to contain horizontal timing marks`
  );
  assert(
    maximumVerticalTimingMarkCount > 1,
    `the ballot card is too small to contain vertical timing marks`
  );

  const remainingHorizontalSpace =
    contentArea.width -
    (maximumHorizontalTimingMarkCount * timingMarkSize.width +
      (maximumHorizontalTimingMarkCount - 1) * timingMarkGapSize.width);
  const remainingVerticalSpace =
    contentArea.height -
    (maximumVerticalTimingMarkCount * timingMarkSize.height +
      (maximumVerticalTimingMarkCount - 1) * timingMarkGapSize.height);

  assert(remainingHorizontalSpace >= 0, `the ballot card is too small`);
  assert(remainingVerticalSpace >= 0, `the ballot card is too small`);

  const horizontalInsetLeft = Math.floor(remainingHorizontalSpace / 2);
  const verticalInsetTop = Math.floor(remainingVerticalSpace / 2);

  const topLeft = timingMarkAt(
    contentArea.minX + horizontalInsetLeft,
    contentArea.minY + verticalInsetTop,
    timingMarkSize
  );
  const topRight = timingMarkAt(
    contentArea.maxX +
      1 -
      (remainingHorizontalSpace - horizontalInsetLeft) -
      timingMarkSize.width,
    contentArea.minY + verticalInsetTop,
    timingMarkSize
  );
  const bottomLeft = timingMarkAt(
    topLeft.x,
    contentArea.maxY +
      1 -
      (remainingVerticalSpace - verticalInsetTop) -
      timingMarkSize.height,
    timingMarkSize
  );
  const bottomRight = timingMarkAt(topRight.x, bottomLeft.y, timingMarkSize);

  assert(
    topLeft.x +
      (maximumHorizontalTimingMarkCount - 1) *
        (timingMarkSize.width + timingMarkGapSize.width) ===
      topRight.x,
    `the timing marks are not evenly spaced horizontally: ${topLeft.x} + ${
      maximumHorizontalTimingMarkCount - 1
    } * ${timingMarkSize.width + timingMarkGapSize.width} (${
      topLeft.x +
      (maximumHorizontalTimingMarkCount - 1) *
        (timingMarkSize.width + timingMarkGapSize.width)
    }) !== ${topRight.x}`
  );
  assert(
    topLeft.y +
      (maximumVerticalTimingMarkCount - 1) *
        (timingMarkSize.height + timingMarkGapSize.height) ===
      bottomLeft.y,
    `the timing marks are not evenly spaced vertically: ${topLeft.y} + ${
      maximumVerticalTimingMarkCount - 1
    } * ${timingMarkSize.height + timingMarkGapSize.height} (${
      topLeft.y +
      (maximumVerticalTimingMarkCount - 1) *
        (timingMarkSize.height + timingMarkGapSize.height)
    }) != ${bottomLeft.y}`
  );

  const topWithoutCorners: Rect[] = [];
  const bottomWithoutCorners: Rect[] = [];

  for (
    let x = topLeft.x + timingMarkSize.width + timingMarkGapSize.width;
    x < topRight.x;
    x += timingMarkSize.width + timingMarkGapSize.width
  ) {
    topWithoutCorners.push(timingMarkAt(x, topLeft.y, timingMarkSize));
    bottomWithoutCorners.push(timingMarkAt(x, bottomLeft.y, timingMarkSize));
  }

  const leftWithoutCorners: Rect[] = [];
  const rightWithoutCorners: Rect[] = [];

  for (
    let y = topLeft.y + timingMarkSize.height + timingMarkGapSize.height;
    y < bottomLeft.y;
    y += timingMarkSize.height + timingMarkGapSize.height
  ) {
    leftWithoutCorners.push(timingMarkAt(topLeft.x, y, timingMarkSize));
    rightWithoutCorners.push(timingMarkAt(topRight.x, y, timingMarkSize));
  }

  return {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    left: [topLeft, ...leftWithoutCorners, bottomLeft],
    right: [topRight, ...rightWithoutCorners, bottomRight],
    top: [topLeft, ...topWithoutCorners, topRight],
    bottom: [bottomLeft, ...bottomWithoutCorners, bottomRight],
  };
}

const EstimatedOptionGridAreaSize: Size = {
  width: 7,
  height: 3,
};
const EstimatedOptionGridOriginOffset = vec(-6, -1);

/**
 * Generate ballot page layouts for VxCentralScan adjudication compatibility.
 */
export function generateBallotPageLayouts(
  election: Election,
  metadata: BallotMetadata,
  {
    optionGridSize = EstimatedOptionGridAreaSize,
    optionGridOriginOffset = EstimatedOptionGridOriginOffset,
  }: { optionGridSize?: Size; optionGridOriginOffset?: Vector } = {}
): Result<BallotPageLayout[], Error> {
  const paperSize = election.ballotLayout?.paperSize;

  if (!paperSize) {
    return err(new Error('paper size is missing'));
  }

  const gridLayout = election.gridLayouts?.find(
    (l) =>
      l.ballotStyleId === metadata.ballotStyleId &&
      l.precinctId === metadata.precinctId
  );

  if (!gridLayout) {
    return err(
      new Error(
        `no grid layout found for ballot style '${metadata.ballotStyleId}' and precinct '${metadata.precinctId}'`
      )
    );
  }

  const geometry = getScannedBallotCardGeometry(paperSize);
  const timingMarks = layoutTimingMarksForGeometry(geometry);
  const timingMarkGrid = computeTimingMarkGrid(timingMarks);
  const layouts: BallotPageLayout[] = [];

  const frontGridPositions = gridLayout.gridPositions.filter(
    ({ side }) => side === 'front'
  );
  const backGridPositions = gridLayout.gridPositions.filter(
    ({ side }) => side === 'back'
  );

  const frontGridPositionsByContest = groupBy(
    frontGridPositions,
    ({ contestId }) => contestId
  );
  const backGridPositionsByContest = groupBy(
    backGridPositions,
    ({ contestId }) => contestId
  );

  function clampRow(row: number): number {
    return Math.max(0, Math.min(row, geometry.gridSize.height - 1));
  }

  function clampColumn(column: number): number {
    return Math.max(0, Math.min(column, geometry.gridSize.width - 1));
  }

  for (const [i, gridPositionsByContestId] of [
    frontGridPositionsByContest,
    backGridPositionsByContest,
  ].entries()) {
    const contests: BallotPageContestLayout[] = [];

    for (const [contestId, gridPositions] of gridPositionsByContestId) {
      const contest = find(election.contests, ({ id }) => id === contestId);
      const contestOptionDefinitions = Array.from(allContestOptions(contest));
      const options: BallotPageContestOptionLayout[] = [];

      for (const gridPosition of Array.from(gridPositions)) {
        const contestOptionDefinition = find(
          contestOptionDefinitions,
          (optionDefinition) =>
            gridPosition.type === 'option'
              ? optionDefinition.id === gridPosition.optionId
              : optionDefinition.optionIndex ===
                gridPosition.writeInIndex +
                  (contest as CandidateContest).candidates.length
        );

        const optionTopLeft = timingMarkGrid.rows[
          clampRow(gridPosition.row + optionGridOriginOffset.y)
        ]?.[
          clampColumn(gridPosition.column + optionGridOriginOffset.x)
        ] as Point;
        const optionBottomRight = timingMarkGrid.rows[
          clampRow(
            gridPosition.row + optionGridOriginOffset.y + optionGridSize.height
          )
        ]?.[
          clampColumn(
            gridPosition.column +
              optionGridOriginOffset.x +
              optionGridSize.width
          )
        ] as Point;
        const ovalCenter = timingMarkGrid.rows[gridPosition.row]?.[
          gridPosition.column
        ] as Point;

        const optionBounds = makeRect({
          minX: optionTopLeft.x,
          minY: optionTopLeft.y,
          maxX: optionBottomRight.x,
          maxY: optionBottomRight.y,
        });
        const targetBounds = makeRect({
          minX: Math.round(ovalCenter.x - geometry.ovalSize.width / 2),
          minY: Math.round(ovalCenter.y - geometry.ovalSize.height / 2),
          maxX: Math.round(ovalCenter.x + geometry.ovalSize.width / 2),
          maxY: Math.round(ovalCenter.y + geometry.ovalSize.height / 2),
        });
        options.push({
          definition: contestOptionDefinition,
          bounds: optionBounds,
          target: {
            bounds: targetBounds,
            inner: targetBounds,
          },
        });
      }

      const minX = Math.min(...options.map((o) => o.bounds.x));
      const minY = Math.min(...options.map((o) => o.bounds.y));
      const maxX = Math.max(
        ...options.map((o) => o.bounds.x + o.bounds.width - 1)
      );
      const maxY = Math.max(
        ...options.map((o) => o.bounds.y + o.bounds.height - 1)
      );
      const bounds = makeRect({ minX, minY, maxX, maxY });

      contests.push({
        contestId,
        options,
        bounds,
        corners: [
          { x: bounds.x, y: bounds.y },
          { x: bounds.x + bounds.width - 1, y: bounds.y },
          { x: bounds.x, y: bounds.y + bounds.height - 1 },
          { x: bounds.x + bounds.width - 1, y: bounds.y + bounds.height - 1 },
        ],
      });
    }

    // ensure the layouts are returned in the contest-order defined by the election definition
    const contestsInOrder = [...contests].sort(
      (a, b) =>
        election.contests.findIndex(({ id }) => id === a.contestId) -
        election.contests.findIndex(({ id }) => id === b.contestId)
    );

    layouts.push({
      metadata: { ...metadata, pageNumber: i + 1 },
      pageSize: geometry.canvasSize,
      contests: contestsInOrder,
    });
  }

  return ok(layouts);
}
