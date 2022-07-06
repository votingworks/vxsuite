import {
  BallotPageContestLayout,
  BallotPageContestOptionLayout,
  BallotPageLayout,
  Contests,
  err,
  GridLayout,
  HmpbBallotPageMetadata,
  ok,
  Rect,
  Result,
} from '@votingworks/types';
import { groupBy } from '@votingworks/utils';
import { Debugger, noDebug } from '../debug';
import { Size } from '../types';
import { loc } from '../utils';
import { InterpretBallotCardLayoutResult } from './interpret_ballot_card_layout';

/**
 * The offset in timing mark columns from the oval to the left-most column
 * that is still within the contest option.
 */
const CONTEST_OPTION_AREA_LEFT_GRID_COLUMN_OFFSET = -6;

/**
 * The offset in timing mark columns from the oval to the left-most column
 * that is still within the contest write-in option.
 */
const CONTEST_WRITE_IN_AREA_LEFT_GRID_COLUMN_OFFSET = -5;

/**
 * The offset in timing mark columns from the oval to the right-most column
 * that is still within the contest option.
 */
const CONTEST_OPTION_AREA_RIGHT_GRID_COLUMN_OFFSET = 1;

/**
 * The offset in timing mark columns from the oval to the right-most column
 * that is still within the contest write-in option.
 */
const CONTEST_WRITE_IN_AREA_RIGHT_GRID_COLUMN_OFFSET = 1;

/**
 * The offset in timing mark rows from the oval to the top-most row
 * that is still within the contest option.
 */
const CONTEST_OPTION_AREA_TOP_GRID_ROW_OFFSET = -1;

/**
 * The offset in timing mark rows from the oval to the bottom-most row
 * that is still within the contest option.
 */
const CONTEST_OPTION_AREA_BOTTOM_GRID_ROW_OFFSET = 1;

/**
 * Converts the NH interpreted ballot card layout to the ballot page layout used
 * by `services/scan`.
 */
export function convertInterpretedLayoutToBallotLayout({
  gridLayout,
  contests,
  metadata,
  interpretedLayout,
  debug = noDebug(),
}: {
  gridLayout: GridLayout;
  contests: Contests;
  metadata: HmpbBallotPageMetadata;
  interpretedLayout: InterpretBallotCardLayoutResult;
  debug?: Debugger;
}): Result<BallotPageLayout, Error> {
  const pageSize: Size = {
    width: interpretedLayout.imageData.width,
    height: interpretedLayout.imageData.height,
  };
  const contestLayouts: BallotPageContestLayout[] = [];
  const { geometry } = interpretedLayout;
  const { ovalSize, timingMarkSize } = geometry;

  const gridPositionsByContestId = groupBy(
    gridLayout.gridPositions,
    (gridPosition) => gridPosition.contestId
  );

  for (const contest of contests) {
    const gridPositions = gridPositionsByContestId.get(contest.id);

    if (!gridPositions) {
      return err(new Error(`contest ${contest.id} has no grid positions`));
    }

    const contestOptionLayouts: BallotPageContestOptionLayout[] = [];

    let contestLayoutMinX = Infinity;
    let contestLayoutMinY = Infinity;
    let contestLayoutMaxX = -Infinity;
    let contestLayoutMaxY = -Infinity;

    for (const gridPosition of gridPositions) {
      if ((gridPosition.side === 'front') !== (metadata.pageNumber === 1)) {
        continue;
      }

      const { row, column } = gridPosition;
      const centerOfGridPosition = interpretedLayout.grid.rows[row]?.[column];

      if (!centerOfGridPosition) {
        return err(
          new Error(
            `contest ${contest.id} has no grid position at row ${row} column ${column}`
          )
        );
      }

      const leftMostContestOptionGridColumn =
        column +
        (gridPosition.type === 'option'
          ? CONTEST_OPTION_AREA_LEFT_GRID_COLUMN_OFFSET
          : CONTEST_WRITE_IN_AREA_LEFT_GRID_COLUMN_OFFSET);
      const rightMostContestOptionGridColumn =
        column +
        (gridPosition.type === 'option'
          ? CONTEST_OPTION_AREA_RIGHT_GRID_COLUMN_OFFSET
          : CONTEST_WRITE_IN_AREA_RIGHT_GRID_COLUMN_OFFSET);
      const topMostContestOptionGridRow =
        row + CONTEST_OPTION_AREA_TOP_GRID_ROW_OFFSET;
      const bottomMostContestOptionGridRow =
        row + CONTEST_OPTION_AREA_BOTTOM_GRID_ROW_OFFSET;

      const centerOfLeftMostContestOptionGridColumn =
        interpretedLayout.grid.rows[row]?.[leftMostContestOptionGridColumn];
      const centerOfRightMostContestOptionGridColumn =
        interpretedLayout.grid.rows[row]?.[rightMostContestOptionGridColumn];
      const centerOfTopMostContestOptionGridRow =
        interpretedLayout.grid.rows[topMostContestOptionGridRow]?.[column];
      const centerOfBottomMostContestOptionGridRow =
        interpretedLayout.grid.rows[bottomMostContestOptionGridRow]?.[column];

      if (
        !centerOfLeftMostContestOptionGridColumn ||
        !centerOfRightMostContestOptionGridColumn ||
        !centerOfTopMostContestOptionGridRow ||
        !centerOfBottomMostContestOptionGridRow
      ) {
        return err(
          new Error(
            `contest ${contest.id} has no grid position at row ${row} column ${leftMostContestOptionGridColumn} or ${rightMostContestOptionGridColumn} or ${topMostContestOptionGridRow} or ${bottomMostContestOptionGridRow}`
          )
        );
      }

      const ovalBounds: Rect = {
        x: Math.round(centerOfGridPosition.x - ovalSize.width / 2),
        y: Math.round(centerOfGridPosition.y - ovalSize.height / 2),
        width: ovalSize.width,
        height: ovalSize.height,
      };
      const contestOptionBoundsTopLeft = loc(
        Math.round(
          centerOfLeftMostContestOptionGridColumn.x - timingMarkSize.width / 2
        ),
        Math.round(
          centerOfTopMostContestOptionGridRow.y - timingMarkSize.height / 2
        )
      );
      const contestOptionBoundsBottomRight = loc(
        Math.round(
          centerOfRightMostContestOptionGridColumn.x + timingMarkSize.width / 2
        ),
        Math.round(
          centerOfBottomMostContestOptionGridRow.y + timingMarkSize.height / 2
        )
      );
      const contestOptionBounds: Rect = {
        x: contestOptionBoundsTopLeft.x,
        y: contestOptionBoundsTopLeft.y,
        width:
          contestOptionBoundsBottomRight.x - contestOptionBoundsTopLeft.x + 1,
        height:
          contestOptionBoundsBottomRight.y - contestOptionBoundsTopLeft.y + 1,
      };

      contestOptionLayouts.push({
        target: {
          bounds: ovalBounds,
          inner: ovalBounds,
        },
        bounds: contestOptionBounds,
      });

      debug.rect(
        ovalBounds.x,
        ovalBounds.y,
        ovalBounds.width,
        ovalBounds.height,
        '#36f74a33'
      );
      debug.rect(
        contestOptionBounds.x,
        contestOptionBounds.y,
        contestOptionBounds.width,
        contestOptionBounds.height,
        '#36f74a33'
      );
      debug.text(
        contestOptionBounds.x,
        contestOptionBounds.y + contestOptionBounds.height,
        gridPosition.type === 'option'
          ? gridPosition.optionId
          : `Write-In #${gridPosition.writeInIndex}`,
        'green'
      );

      contestLayoutMinX = Math.min(contestLayoutMinX, contestOptionBounds.x);
      contestLayoutMinY = Math.min(contestLayoutMinY, contestOptionBounds.y);
      contestLayoutMaxX = Math.max(
        contestLayoutMaxX,
        contestOptionBounds.x + contestOptionBounds.width - 1
      );
      contestLayoutMaxY = Math.max(
        contestLayoutMaxY,
        contestOptionBounds.y + contestOptionBounds.height - 1
      );
    }

    if (contestOptionLayouts.length === 0) {
      continue;
    }

    const contestLayoutBounds: Rect = {
      x: contestLayoutMinX,
      y: contestLayoutMinY,
      width: contestLayoutMaxX - contestLayoutMinX + 1,
      height: contestLayoutMaxY - contestLayoutMinY + 1,
    };

    contestLayouts.push({
      contestId: contest.id,
      bounds: contestLayoutBounds,
      corners: [
        { x: contestLayoutMinX, y: contestLayoutMinY },
        { x: contestLayoutMaxX, y: contestLayoutMinY },
        { x: contestLayoutMaxX, y: contestLayoutMaxY },
        { x: contestLayoutMinX, y: contestLayoutMaxY },
      ],
      options: contestOptionLayouts,
    });

    debug.rect(
      contestLayoutBounds.x,
      contestLayoutBounds.y,
      contestLayoutBounds.width,
      contestLayoutBounds.height,
      '#f7f43633'
    );
    debug.text(
      contestLayoutBounds.x,
      contestLayoutBounds.y,
      `${contest.id} ${contest.title}`,
      '#807e1c'
    );
  }

  return ok({ pageSize, contests: contestLayouts, metadata });
}
