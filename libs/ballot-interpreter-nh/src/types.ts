import { BallotPaperSize, NewType } from '@votingworks/types';
import { z } from 'zod';

/**
 * A point in 2D space.
 */
export type Point = NewType<
  {
    readonly x: number;
    readonly y: number;
  },
  'Point'
>;

/**
 * Schema for {@link Point}.
 */
export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
}) as unknown as z.ZodSchema<Point>;

/**
 * A vector in 2D space.
 */
export type Vector = NewType<
  {
    readonly x: number;
    readonly y: number;
  },
  'Vector'
>;

/**
 * A size in 2D space.
 */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * A rectangle in 2D space.
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * A line segment in 2D space.
 */
export interface Segment {
  readonly from: Point;
  readonly to: Point;
}

/**
 * Potentially-incomplete timing marks for a ballot card.
 */
export interface PartialTimingMarks {
  readonly bottom: readonly Rect[];
  readonly left: readonly Rect[];
  readonly right: readonly Rect[];
  readonly top: readonly Rect[];
  readonly topLeft?: Rect;
  readonly topRight?: Rect;
  readonly bottomLeft?: Rect;
  readonly bottomRight?: Rect;
}

/**
 * Complete timing marks for a ballot card. Includes all timing marks,
 * meaning that the timing marks are evenly spaced and left and right
 * have the same number of timing marks. Also includes the corners. All top
 * timing marks are included, though bottom marks may be missing because the
 * bottom row is used for encoding metadata.
 */
export interface CompleteTimingMarks {
  readonly bottom: readonly Rect[];
  readonly left: readonly Rect[];
  readonly right: readonly Rect[];
  readonly top: readonly Rect[];
  readonly topLeft: Rect;
  readonly topRight: Rect;
  readonly bottomLeft: Rect;
  readonly bottomRight: Rect;
}

/**
 * Contains a grid of all possible locations for option bubbles on the ballot
 * card. If a ballot card has N columns and M rows, there are (N - 1) * (M - 1)
 * potential option bubble locations.
 */
export interface PossibleOptionBubblesGrid {
  readonly rows: ReadonlyArray<readonly Point[]>;
}

/**
 * Represents a single bit, yes = 1, no = 0.
 */
export type Bit = 0 | 1;

/**
 * Represents two bits.
 */
export type TwoBits = readonly [Bit, Bit];

/**
 * Represents four bits.
 */
export type FourBits = readonly [...TwoBits, ...TwoBits];

/**
 * Represents eight bits, or a single byte.
 */
export type EightBits = readonly [...FourBits, ...FourBits];

/**
 * Represents sixteen bits, or two bytes.
 */
export type SixteenBits = readonly [...EightBits, ...EightBits];

/**
 * Represents thirty-two bits, or four bytes.
 */
export type ThirtyTwoBits = readonly [...SixteenBits, ...SixteenBits];

/**
 * Schema for {@link Bit}.
 */
export const BitSchema: z.ZodSchema<Bit> = z.union([
  z.literal(0),
  z.literal(1),
]);

/**
 * Schema for {@link ThirtyTwoBits}.
 */
export const ThirtyTwoBitsSchema: z.ZodSchema<ThirtyTwoBits> = z.tuple([
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
  BitSchema,
]);

/**
 * Geometry information about an ballot card with timing marks.
 */
export interface BallotCardGeometry {
  /**
   * The size of the ballot card as a standard paper size.
   */
  readonly ballotPaperSize: BallotPaperSize;

  /**
   * Pixels per inch of the ballot card.
   */
  readonly pixelsPerInch: number;

  /**
   * The size of the ballot card in pixels.
   */
  readonly canvasSize: Size;

  /**
   * The content area of the ballot card in pixels.
   */
  readonly contentArea: Rect;

  /**
   * The size of a timing mark in pixels.
   */
  readonly timingMarkSize: Size;

  /**
   * The size of an oval in pixels.
   */
  readonly ovalSize: Size;

  /**
   * The size of the grid of timing marks, in units of timing marks. For
   * example, a grid of size `{ width: 20, height: 30 }` means there are 20
   * columns of timing marks and 30 rows of timing marks.
   */
  readonly gridSize: Size;

  /**
   * The area within the timing mark grid on the front of the ballot card that
   * may be used for ovals. In practice, there will be at least one edge in each
   * direction that is not usable for ovals.
   */
  readonly frontUsableArea: Rect;

  /**
   * The area within the timing mark grid on the back of the ballot card that
   * may be used for ovals. In practice, there will be at least one edge in each
   * direction that is not usable for ovals.
   */
  readonly backUsableArea: Rect;
}

/**
 * Ballot card orientation.
 */
export enum BallotCardOrientation {
  /**
   * The ballot card is portrait and right-side up.
   */
  Portrait = 'portrait',

  /**
   * The ballot card is portrait and upside down.
   */
  PortraitReversed = 'portrait-reversed',

  /**
   * The ballot card is landscape and right-side up.
   */
  Landscape = 'landscape',

  /**
   * The ballot card is landscape and upside down.
   */
  LandscapeReversed = 'landscape-reversed',
}
