import { GridPosition, NewType } from '@votingworks/types';
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
 * Schema for {@link Vector}.
 */
export const VectorSchema = z.object({
  x: z.number(),
  y: z.number(),
}) as unknown as z.ZodSchema<Vector>;

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
 * Metadata encoded by the bottom row of the front of a ballot card.
 */
export interface FrontMarksMetadata {
  /**
   * Raw bits 0-31 in LSB-MSB order (right-to-left).
   */
  readonly bits: ThirtyTwoBits;

  /**
   * Mod 4 check sum from bits 0-1 (2 bits).
   *
   * The mod 4 check sum bits are obtained by adding the number of 1’s in bits 2
   * through 31, then encoding the results of a mod 4 operation in bits 0 and 1.
   * For example, if bits 2 through 31 have 18 1’s, bits 0 and 1 will hold the
   * value 2 (18 mod 4 = 2).
   */
  readonly mod4CheckSum: number;

  /**
   * The mod 4 check sum computed from bits 2-31.
   */
  readonly computedMod4CheckSum: number;

  /**
   * Batch or precinct number from bits 2-14 (13 bits).
   */
  readonly batchOrPrecinctNumber: number;

  /**
   * Card number (CardRotID) from bits 15-27 (13 bits).
   */
  readonly cardNumber: number;

  /**
   * Sequence number (always 0) from bits 28-30 (3 bits).
   */
  readonly sequenceNumber: number;

  /**
   * Start bit (always 1) from bit 31-31 (1 bit).
   */
  readonly startBit: Bit;
}

/**
 * Schema for {@link FrontMarksMetadata}.
 */
export const FrontMarksMetadataSchema: z.ZodSchema<FrontMarksMetadata> = z
  .object({
    bits: ThirtyTwoBitsSchema,
    mod4CheckSum: z.number(),
    computedMod4CheckSum: z.number(),
    batchOrPrecinctNumber: z.number().int().nonnegative(),
    cardNumber: z.number().int().nonnegative(),
    sequenceNumber: z
      .number()
      .int()
      .nonnegative()
      .refine((n) => n === 0, 'sequenceNumber must be 0'),
    startBit: BitSchema.refine(
      (bit) => bit === 1,
      'startBit must be 1'
    ) as typeof BitSchema,
  })
  .refine(
    ({ mod4CheckSum, computedMod4CheckSum }) =>
      mod4CheckSum === computedMod4CheckSum,
    'mod4CheckSum must equal computedMod4CheckSum'
  );

/**
 * Metadata encoded by the bottom row of the back of a ballot card.
 */
export interface BackMarksMetadata {
  /**
   * Raw bits 0-31 in LSB-MSB order (right-to-left).
   */
  readonly bits: ThirtyTwoBits;

  /**
   * Election day of month (1..31) from bits 0-4 (5 bits).
   */
  readonly electionDay: number;

  /**
   * Election month (1..12) from bits 5-8 (4 bits).
   */
  readonly electionMonth: number;

  /**
   * Election year (2 digits) from bits 9-15 (7 bits).
   */
  readonly electionYear: number;

  /**
   * Election type from bits 16-20 (5 bits).
   *
   * @example "G" for general election
   */
  readonly electionType:
    | 'A'
    | 'B'
    | 'C'
    | 'D'
    | 'E'
    | 'F'
    | 'G'
    | 'H'
    | 'I'
    | 'J'
    | 'K'
    | 'L'
    | 'M'
    | 'N'
    | 'O'
    | 'P'
    | 'Q'
    | 'R'
    | 'S'
    | 'T'
    | 'U'
    | 'V'
    | 'W'
    | 'X'
    | 'Y'
    | 'Z';

  /**
   * Ender code (binary 01111011110) from bits 21-31 (11 bits).
   */
  readonly enderCode: [Bit, ...TwoBits, ...EightBits];

  /**
   * Ender code (binary 01111011110) hardcoded to the expected value.
   */
  readonly expectedEnderCode: [Bit, ...TwoBits, ...EightBits];
}

/**
 * Schema for {@link BackMarksMetadata}.
 */
export const BackMarksMetadataSchema: z.ZodSchema<BackMarksMetadata> = z
  .object({
    bits: ThirtyTwoBitsSchema,
    electionDay: z
      .number()
      .int()
      .positive()
      .refine((n) => n <= 31, 'electionDay must be between 1 and 31'),
    electionMonth: z
      .number()
      .int()
      .positive()
      .refine((n) => n <= 12, 'electionMonth must be between 1 and 12'),
    electionYear: z
      .number()
      .int()
      .positive()
      .refine((n) => n <= 99, 'electionYear must be between 0 and 99'),
    electionType: z.union([
      z.literal('A'),
      z.literal('B'),
      z.literal('C'),
      z.literal('D'),
      z.literal('E'),
      z.literal('F'),
      z.literal('G'),
      z.literal('H'),
      z.literal('I'),
      z.literal('J'),
      z.literal('K'),
      z.literal('L'),
      z.literal('M'),
      z.literal('N'),
      z.literal('O'),
      z.literal('P'),
      z.literal('Q'),
      z.literal('R'),
      z.literal('S'),
      z.literal('T'),
      z.literal('U'),
      z.literal('V'),
      z.literal('W'),
      z.literal('X'),
      z.literal('Y'),
      z.literal('Z'),
    ]),
    enderCode: z.tuple([
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
    ]),
    expectedEnderCode: z.tuple([
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
    ]),
  })
  .refine(
    ({ enderCode, expectedEnderCode }) =>
      enderCode.length === expectedEnderCode.length &&
      enderCode.every((bit, i) => bit === expectedEnderCode[i]),
    'enderCode must be the expected value'
  );

/**
 * An interpretation of an oval mark on a ballot.
 */
export interface InterpretedOvalMark {
  readonly gridPosition: GridPosition;
  readonly score: number;
  readonly scoredOffset: Vector;
  readonly bounds: Rect;
}

/**
 * Interpreted front ballot scan page layout.
 */
export interface ScannedBallotFrontPageLayout {
  readonly side: 'front';
  readonly metadata: FrontMarksMetadata;
  readonly partialMarks: PartialTimingMarks;
  readonly completeMarks: CompleteTimingMarks;
}

/**
 * Interpreted back ballot scan page layout.
 */
export interface ScannedBallotBackPageLayout {
  readonly side: 'back';
  readonly metadata: BackMarksMetadata;
  readonly partialMarks: PartialTimingMarks;
  readonly completeMarks: CompleteTimingMarks;
}

/**
 * Interpreted ballot scan page.
 */
export type ScannedBallotPageLayout =
  | ScannedBallotFrontPageLayout
  | ScannedBallotBackPageLayout;
