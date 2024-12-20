import { assert, assertDefined } from '@votingworks/basics';
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

export enum WriteInAreaStatus {
  Filled = 'filled',
  Unfilled = 'unfilled',
  Ignored = 'ignored',
}
export const WriteInAreaStatusSchema: z.ZodSchema<WriteInAreaStatus> =
  z.nativeEnum(WriteInAreaStatus);

export type SheetOf<T> = readonly [T, T];

/**
 * Helper for mapping sheet-wise data from one format to another.
 */
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T, side: Side, index: 0 | 1) => Promise<U>
): Promise<SheetOf<U>>;
export function mapSheet<T, U>(
  sheet: SheetOf<T>,
  fn: (page: T, side: Side, index: 0 | 1) => U
): SheetOf<U>;
export function mapSheet<T, U, V>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  fn: (page1: T, page2: U, side: Side, index: 0 | 1) => Promise<V>
): Promise<SheetOf<V>>;
export function mapSheet<T, U, V>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  fn: (page1: T, page2: U, side: Side, index: 0 | 1) => V
): SheetOf<V>;
export function mapSheet<T, U, V, W>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<W>,
  fn: (page1: T, page2: U, page3: V, side: Side, index: 0 | 1) => Promise<W>
): Promise<SheetOf<W>>;
export function mapSheet<T, U, V, W>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<V>,
  fn: (page1: T, page2: U, page3: V, side: Side, index: 0 | 1) => W
): SheetOf<W>;
export function mapSheet<T, U, V, W, X>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<V>,
  sheet4: SheetOf<W>,
  fn: (
    page1: T,
    page2: U,
    page3: V,
    page4: W,
    side: Side,
    index: 0 | 1
  ) => Promise<X>
): Promise<SheetOf<W>>;
export function mapSheet<T, U, V, W, X>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<V>,
  sheet4: SheetOf<W>,
  fn: (page1: T, page2: U, page3: V, page4: W, side: Side, index: 0 | 1) => X
): SheetOf<X>;
export function mapSheet<T, U, V, W, X, Y>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<V>,
  sheet4: SheetOf<W>,
  sheet5: SheetOf<X>,
  fn: (
    page1: T,
    page2: U,
    page3: V,
    page4: W,
    page5: X,
    side: Side,
    index: 0 | 1
  ) => Promise<Y>
): Promise<SheetOf<Y>>;
export function mapSheet<T, U, V, W, X, Y>(
  sheet1: SheetOf<T>,
  sheet2: SheetOf<U>,
  sheet3: SheetOf<V>,
  sheet4: SheetOf<W>,
  sheet5: SheetOf<X>,
  fn: (
    page1: T,
    page2: U,
    page3: V,
    page4: W,
    page5: X,
    side: Side,
    index: 0 | 1
  ) => Y
): SheetOf<Y>;
export function mapSheet<F extends (...args: unknown[]) => unknown>(
  ...args: [...sheets: Array<SheetOf<unknown>>, fn: F]
): SheetOf<unknown> | Promise<SheetOf<unknown>> {
  const fn = assertDefined(args.pop()) as unknown as (
    ...args: [...pages: readonly unknown[], side: Side, index: 0 | 1]
  ) => unknown | Promise<unknown>;
  const sheets = args as ReadonlyArray<SheetOf<unknown>>;
  const front = fn(
    ...(sheets.map((sheet) => sheet[0]) as readonly unknown[]),
    'front',
    0
  );
  const back = fn(
    ...(sheets.map((sheet) => sheet[1]) as readonly unknown[]),
    'back',
    1
  );

  if (
    front &&
    back &&
    typeof (front as unknown as PromiseLike<unknown>).then === 'function' &&
    typeof (back as unknown as PromiseLike<unknown>).then === 'function'
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
