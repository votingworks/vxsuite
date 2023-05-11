import { assert } from '@votingworks/basics';
import { z } from 'zod';
import {
  ContestId,
  ContestOption,
  ContestOptionSchema,
  HmpbBallotPageMetadata,
  HmpbBallotPageMetadataSchema,
  Side,
  TargetShape,
  TargetShapeSchema,
} from './election';
import { IdSchema } from './generic';
import {
  Corners,
  CornersSchema,
  Rect,
  RectSchema,
  Size,
  SizeSchema,
} from './geometry';
import { ImageData, ImageDataSchema } from './image';

export type BallotPageMetadata = HmpbBallotPageMetadata;
export const BallotPageMetadataSchema = HmpbBallotPageMetadataSchema;

export interface BallotImage {
  imageData: ImageData;
  metadata: BallotPageMetadata;
}
export const BallotImageSchema: z.ZodSchema<BallotImage> = z.object({
  imageData: ImageDataSchema,
  metadata: BallotPageMetadataSchema,
});

export interface BallotPageContestOptionLayout {
  definition?: ContestOption;
  bounds: Rect;
  target: TargetShape;
}
export const BallotPageContestOptionLayoutSchema: z.ZodSchema<BallotPageContestOptionLayout> =
  z.object({
    definition: ContestOptionSchema.optional(),
    bounds: RectSchema,
    target: TargetShapeSchema,
  });

export interface BallotPageContestLayout {
  contestId: ContestId;
  bounds: Rect;
  corners: Corners;
  options: readonly BallotPageContestOptionLayout[];
}
export const BallotPageContestLayoutSchema: z.ZodSchema<BallotPageContestLayout> =
  z.object({
    contestId: IdSchema,
    bounds: RectSchema,
    corners: CornersSchema,
    options: z.array(BallotPageContestOptionLayoutSchema),
  });

export interface BallotPageLayout {
  pageSize: Size;
  metadata: BallotPageMetadata;
  contests: readonly BallotPageContestLayout[];
}
export const BallotPageLayoutSchema: z.ZodSchema<BallotPageLayout> = z.object({
  pageSize: SizeSchema,
  metadata: BallotPageMetadataSchema,
  contests: z.array(BallotPageContestLayoutSchema),
});

export enum MarkStatus {
  Marked = 'marked',
  Unmarked = 'unmarked',
  Marginal = 'marginal',
}
export const MarkStatusSchema: z.ZodSchema<MarkStatus> =
  z.nativeEnum(MarkStatus);

export type SheetOf<T> = readonly [T, T];

/**
 * Helper for mapping sheet-wise data from one format to another.
 */
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T, side: Side) => Promise<U>
): Promise<SheetOf<U>>;
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T, side: Side) => U
): SheetOf<U>;
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T, side: Side) => U
): SheetOf<U> | Promise<SheetOf<U>> {
  const front = fn(sheet[0], 'front');
  const back = fn(sheet[1], 'back');

  if (
    front &&
    back &&
    typeof (front as unknown as PromiseLike<U>).then === 'function' &&
    typeof (back as unknown as PromiseLike<U>).then === 'function'
  ) {
    return Promise.all([front, back]);
  }

  return [front, back];
}

/**
 * Asserts that the array is of length two and returns it typed as a sheet.
 */
export function asSheet<T>(array: T[]): SheetOf<T> {
  assert(array.length === 2);
  return array as unknown as SheetOf<T>;
}
