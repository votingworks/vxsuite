import { z } from 'zod';
import { type HmpbBallotPageMetadata } from './election';

/** Metadata from the ballot card. */
export type BallotPageMetadata =
  | BallotPageTimingMarkMetadata
  | BallotPageQrCodeMetadata;

/** Metadata from a ballot card QR code. */
export interface BallotPageQrCodeMetadata extends HmpbBallotPageMetadata {
  source: 'qr-code';
}

/** Metadata from the ballot card bottom timing marks. */
export type BallotPageTimingMarkMetadata = (
  | BallotPageTimingMarkMetadataFront
  | BallotPageTimingMarkMetadataBack
) & { source: 'timing-marks' };

/** Represents a single capital letter from A-Z. */
export type IndexedCapitalLetter =
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

export const IndexedCapitalLetterSchema: z.ZodSchema<IndexedCapitalLetter> = z
  .string()
  .refine(
    (value): value is IndexedCapitalLetter =>
      value.length === 1 && /^[A-Z]$/.test(value)
  );

/** Metadata encoded on the front side of a ballot card. */
export interface BallotPageTimingMarkMetadataFront {
  side: 'front';

  /**
   * Mod 4 check sum from bits 0-1 (2 bits).
   *
   * The mod 4 check sum bits are obtained by adding the number of 1’s in bits 2
   * through 31, then encoding the results of a mod 4 operation in bits 0 and 1.
   * For example, if bits 2 through 31 have 18 1’s, bits 0 and 1 will hold the
   * value 2 (18 mod 4 = 2).
   */
  mod4Checksum: number;

  /** The mod 4 check sum computed from bits 2-31. */
  computedMod4Checksum: number;

  /** Batch or precinct number from bits 2-14 (13 bits). */
  batchOrPrecinctNumber: number;

  /** Card number (CardRotID) from bits 15-27 (13 bits). */
  cardNumber: number;

  /** Sequence number (always 0) from bits 28-30 (3 bits). */
  sequenceNumber: number;

  /** Start bit (always 1) from bit 31-31 (1 bit). */
  startBit: number;
}

/**
 * Compares two {@link BallotPageTimingMarkMetadataFront} objects for equality.
 */
export function areBallotPageTimingMarkMetadataFrontEqual(
  a: BallotPageTimingMarkMetadataFront,
  b: BallotPageTimingMarkMetadataFront
): boolean {
  return (
    a.side === b.side &&
    a.mod4Checksum === b.mod4Checksum &&
    a.computedMod4Checksum === b.computedMod4Checksum &&
    a.batchOrPrecinctNumber === b.batchOrPrecinctNumber &&
    a.cardNumber === b.cardNumber &&
    a.sequenceNumber === b.sequenceNumber &&
    a.startBit === b.startBit
  );
}

/**
 * Schema for {@link BallotPageTimingMarkMetadataFront}.
 */
export const BallotPageTimingMarkMetadataFrontSchema: z.ZodSchema<BallotPageTimingMarkMetadataFront> =
  z.object({
    side: z.literal('front'),
    mod4Checksum: z.number(),
    computedMod4Checksum: z.number(),
    batchOrPrecinctNumber: z.number(),
    cardNumber: z.number(),
    sequenceNumber: z.number(),
    startBit: z.number(),
  });

/** Metadata encoded on the front side of a ballot card. */
export interface BallotPageTimingMarkMetadataBack {
  side: 'back';

  /** Election day of month (1..31) from bits 0-4 (5 bits). */
  electionDay: number;

  /** Election month (1..12) from bits 5-8 (4 bits). */
  electionMonth: number;

  /** Election year (2 digits) from bits 9-15 (7 bits). */
  electionYear: number;

  /**
   * Election type from bits 16-20 (5 bits).
   *
   * @example "G" for general election
   */
  electionType: IndexedCapitalLetter;
}

/**
 * Compares two {@link BallotPageTimingMarkMetadataBack} objects for equality.
 */
export function areBallotPageTimingMarkMetadataBackEqual(
  a: BallotPageTimingMarkMetadataBack,
  b: BallotPageTimingMarkMetadataBack
): boolean {
  return (
    a.side === b.side &&
    a.electionDay === b.electionDay &&
    a.electionMonth === b.electionMonth &&
    a.electionYear === b.electionYear &&
    a.electionType === b.electionType
  );
}

/**
 * Schema for {@link BallotPageTimingMarkMetadataBack}.
 */
export const BallotPageTimingMarkMetadataBackSchema: z.ZodSchema<BallotPageTimingMarkMetadataBack> =
  z.object({
    side: z.literal('back'),
    electionDay: z.number(),
    electionMonth: z.number(),
    electionYear: z.number(),
    electionType: IndexedCapitalLetterSchema,
  });
