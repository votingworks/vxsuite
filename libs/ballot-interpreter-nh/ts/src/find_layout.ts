import { Result, err, ok } from '@votingworks/basics';
import { SheetOf } from '@votingworks/types';
// eslint-disable-next-line import/no-unresolved -- `./rust-addon` is a native module
import { findLayout as findLayoutImpl } from './rust-addon';
import { Point, TimingMarkGrid, u32 } from './types';

/**
 * The result of calling {@link findLayout}.
 */
export interface FoundLayout {
  layouts: SheetOf<{ grid: TimingMarkGrid; bubbles: Array<Point<u32>> }>;
}

/**
 * Finds the timing mark grid layout of a ballot card. Does not interpret.
 */
export function findLayout(
  ballotImages: SheetOf<ImageData>
): Result<FoundLayout, unknown> {
  try {
    return ok(findLayoutImpl(ballotImages[0], ballotImages[1]));
  } catch (error) {
    return err(error);
  }
}
