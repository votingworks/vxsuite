import { assert, assertDefined } from '@votingworks/basics';
import { Outset, Rect } from './geometry';
import { Id } from './generic';
import {
  ContestId,
  ContestOptionPosition,
  ContestPosition,
  GridPoint,
  GridPosition,
  GridRect,
  GridUnit,
  PartyId,
  SheetPositions,
} from './election';

/**
 * The option bounds outset to assume when a source format (e.g. CDF) doesn't
 * carry per-option bounds. Matches what generally works well for our HMPBs.
 */
export const DEFAULT_OPTION_BOUNDS_FROM_TARGET_MARK_OUTSET: Outset = {
  top: 1,
  left: 1,
  right: 9,
  bottom: 1,
};

/**
 * Expands a bubble center by an outset (in grid units) into an option bounding
 * box. This reproduces the historical per-option bounds calculation that the
 * ballot interpreter derived from a single shared `optionBoundsFromTargetMark`.
 */
export function optionBoundsFromTargetMarkOutset(
  bubbleCenter: GridPoint,
  outset: Outset
): GridRect {
  return {
    column: bubbleCenter.column - outset.left,
    row: bubbleCenter.row - outset.top,
    width: outset.left + outset.right,
    height: outset.top + outset.bottom,
  };
}

/**
 * Recovers the outset from a bubble center to its option bounds. Inverse of
 * {@link optionBoundsFromTargetMarkOutset}.
 */
export function outsetFromOptionPosition(
  option: ContestOptionPosition
): Outset {
  const { bubbleCenter, bounds } = option;
  return {
    top: bubbleCenter.row - bounds.row,
    left: bubbleCenter.column - bounds.column,
    right: bounds.column + bounds.width - bubbleCenter.column,
    bottom: bounds.row + bounds.height - bubbleCenter.row,
  };
}

/** Returns the smallest grid rect that contains all of the given rects. */
export function unionGridRects(rects: readonly GridRect[]): GridRect {
  assert(rects.length > 0, 'cannot union zero rects');
  const minColumn = Math.min(...rects.map((r) => r.column));
  const minRow = Math.min(...rects.map((r) => r.row));
  const maxColumn = Math.max(...rects.map((r) => r.column + r.width));
  const maxRow = Math.max(...rects.map((r) => r.row + r.height));
  return {
    column: minColumn,
    row: minRow,
    width: maxColumn - minColumn,
    height: maxRow - minRow,
  };
}

/** Converts an (x, y) {@link Rect} to a (column, row) {@link GridRect}. */
export function rectToGridRect(rect: Rect): GridRect {
  return {
    column: rect.x,
    row: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

/** Converts a (column, row) {@link GridRect} to an (x, y) {@link Rect}. */
export function gridRectToRect(gridRect: GridRect): Rect {
  return {
    x: gridRect.column,
    y: gridRect.row,
    width: gridRect.width,
    height: gridRect.height,
  };
}

/**
 * A single option position together with the sheet/side/contest it belongs to.
 * Used as the intermediate, "flat" representation when converting to/from the
 * nested {@link SheetPositions} structure.
 */
export interface FlatOptionPosition {
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly contestId: ContestId;
  readonly option: ContestOptionPosition;
}

/**
 * Groups flat option positions into the nested per-sheet structure
 * (sheets -> contests -> options), preserving input order and computing each
 * contest's bounds as the union of its option bounds.
 */
export function groupOptionPositionsIntoSheets(
  positions: readonly FlatOptionPosition[]
): SheetPositions[] {
  // sheetNumber (1-based) -> side -> contestId -> options
  const bySheet = new Map<
    number,
    Record<'front' | 'back', Map<ContestId, ContestOptionPosition[]>>
  >();

  for (const { sheetNumber, side, contestId, option } of positions) {
    let sheet = bySheet.get(sheetNumber);
    if (!sheet) {
      sheet = { front: new Map(), back: new Map() };
      bySheet.set(sheetNumber, sheet);
    }
    const contests = sheet[side];
    let options = contests.get(contestId);
    if (!options) {
      options = [];
      contests.set(contestId, options);
    }
    options.push(option);
  }

  function toContestPositions(
    contests: Map<ContestId, ContestOptionPosition[]>
  ): ContestPosition[] {
    return [...contests].map(([contestId, options]) => ({
      contestId,
      bounds: unionGridRects(options.map((o) => o.bounds)),
      options,
    }));
  }

  const maxSheetNumber = Math.max(0, ...bySheet.keys());
  const sheets: SheetPositions[] = [];
  for (let sheetNumber = 1; sheetNumber <= maxSheetNumber; sheetNumber += 1) {
    // @coverage-defer
    const sheet = bySheet.get(sheetNumber) ?? {
      front: new Map(),
      back: new Map(),
    };
    sheets.push([
      toContestPositions(sheet.front),
      toContestPositions(sheet.back),
    ]);
  }
  return sheets;
}

/**
 * Flattens the nested per-sheet structure back into flat option positions,
 * recovering each option's sheet number (1-based) and side. Inverse of
 * {@link groupOptionPositionsIntoSheets}.
 */
export function flattenBallotPositions(
  ballotPositions: readonly SheetPositions[]
): FlatOptionPosition[] {
  const flat: FlatOptionPosition[] = [];
  for (const [sheetIndex, [front, back]] of ballotPositions.entries()) {
    const sheetNumber = sheetIndex + 1;
    for (const [side, contests] of [
      ['front', front],
      ['back', back],
    ] as const) {
      for (const contest of contests) {
        for (const option of contest.options) {
          flat.push({
            sheetNumber,
            side,
            contestId: contest.contestId,
            option,
          });
        }
      }
    }
  }
  return flat;
}

/**
 * Flattens a ballot style's {@link SheetPositions} into the interpreter's flat
 * {@link GridPosition} list (bubble center as column/row, write-in area as an
 * (x, y) {@link Rect}). The TypeScript mirror of the Rust
 * `Election::grid_layouts()`; per-option bounds are not carried since
 * `GridPosition` is the per-bubble representation.
 */
export function gridPositionsFromBallotPositions(
  ballotPositions: readonly SheetPositions[]
): GridPosition[] {
  return flattenBallotPositions(ballotPositions).map(
    ({ sheetNumber, side, contestId, option }): GridPosition => {
      const base = {
        sheetNumber,
        side,
        contestId,
        column: option.bubbleCenter.column,
        row: option.bubbleCenter.row,
      } as const;
      return option.type === 'write-in'
        ? {
            ...base,
            type: 'write-in',
            writeInIndex: option.writeInIndex,
            writeInArea: gridRectToRect(option.writeInArea),
          }
        : {
            ...base,
            type: 'option',
            optionId: option.optionId,
            ...(option.partyIds ? { partyIds: option.partyIds } : {}),
          };
    }
  );
}

/**
 * The legacy (pre-v4.1) flat grid-position shape: a bubble center (column/row)
 * plus the option's identity, where per-option bounds were derived from a
 * single shared `optionBoundsFromTargetMark` outset rather than stored.
 */
export interface FlatGridPosition {
  readonly type: 'option' | 'write-in';
  readonly sheetNumber: number;
  readonly side: 'front' | 'back';
  readonly contestId: ContestId;
  readonly column: GridUnit;
  readonly row: GridUnit;
  readonly optionId?: Id;
  readonly partyIds?: readonly PartyId[];
  readonly writeInIndex?: number;
  readonly writeInArea?: Rect;
}

/**
 * Builds the hierarchical {@link SheetPositions} structure from a flat list of
 * legacy grid positions and a single shared option-bounds outset, deriving each
 * option's bounds (and each contest's union bounds) the way the ballot
 * interpreter historically did. Used for v4.0 import and for fixtures.
 */
export function ballotPositionsFromGridPositions(
  gridPositions: readonly FlatGridPosition[],
  optionBoundsFromTargetMark: Outset
): SheetPositions[] {
  return groupOptionPositionsIntoSheets(
    gridPositions.map((gridPosition): FlatOptionPosition => {
      const bubbleCenter: GridPoint = {
        row: gridPosition.row,
        column: gridPosition.column,
      };
      const bounds = optionBoundsFromTargetMarkOutset(
        bubbleCenter,
        optionBoundsFromTargetMark
      );
      const option: ContestOptionPosition =
        gridPosition.type === 'write-in'
          ? {
              type: 'write-in',
              bubbleCenter,
              bounds,
              writeInIndex: assertDefined(gridPosition.writeInIndex),
              writeInArea: rectToGridRect(
                assertDefined(gridPosition.writeInArea)
              ),
            }
          : {
              type: 'option',
              bubbleCenter,
              bounds,
              optionId: assertDefined(gridPosition.optionId),
              ...(gridPosition.partyIds
                ? { partyIds: gridPosition.partyIds }
                : {}),
            };
      return {
        sheetNumber: gridPosition.sheetNumber,
        side: gridPosition.side,
        contestId: gridPosition.contestId,
        option,
      };
    })
  );
}
