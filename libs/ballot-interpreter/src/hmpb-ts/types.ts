import { ImageData } from 'canvas';
import {
  BallotPaperSize,
  GridPosition,
  HmpbBallotPageMetadata,
} from '@votingworks/types';
import { Optional, Result } from '@votingworks/basics';

/*
 * Many of these types are from the Rust code.
 *
 * IF YOU CHANGE ANYTHING HERE, YOU MUST ALSO CHANGE IT THERE.
 */

/** Rust u8 mapped to TypeScript. */
export type u8 = number;

/** Rust u16 mapped to TypeScript. */
export type u16 = number;

/** Rust u32 mapped to TypeScript. */
export type u32 = number;

/** Rust usize mapped to TypeScript. */
export type usize = number;

/** Rust i32 mapped to TypeScript. */
export type i32 = number;

/** Rust f32 mapped to TypeScript. */
export type f32 = number;

/**
 * A unit of length in timing mark grid, i.e. 1 `GridUnit` is the logical
 * distance from one timing mark to the next. This does not map directly to
 * pixels.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type GridUnit = u32;

/**
 * An x or y coordinate in pixels.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type PixelPosition = i32;

/**
 * A width or height in pixels.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type PixelUnit = u32;

/**
 * A sub-pixel coordinate or distance of pixels.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type SubPixelUnit = f32;

/**
 * Angle in radians.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type Radians = f32;

/** An inset is a set of pixel offsets from the edges of an image. */
export interface Inset {
  /** The number of pixels to remove from the top of the image. */
  top: PixelUnit;

  /** The number of pixels to remove from the bottom of the image. */
  bottom: PixelUnit;

  /** The number of pixels to remove from the left of the image. */
  left: PixelUnit;

  /** The number of pixels to remove from the right of the image. */
  right: PixelUnit;
}

/** Top-level result of interpretation. */
export type HmpbInterpretResult = Result<InterpretedBallotCard, InterpretError>;

/** A successfully interpreted ballot card. */
export interface InterpretedBallotCard {
  front: InterpretedBallotPage;
  back: InterpretedBallotPage;
}

/** A successfully imported ballot page. */
export interface InterpretedBallotPage {
  grid: TimingMarkGrid;
  metadata: BallotPageMetadata;
  marks: ScoredBubbleMarks;
  writeIns: ScoredPositionArea[];
  normalizedImage: ImageData;
  contestLayouts: InterpretedContestLayout[];
}

/** The pixel bounds outlining a contest option in the normalized ballot image. */
export interface InterpretedContestOptionLayout {
  optionId: string;
  bounds: Rect;
}

/** The pixel bounds outlining a contest in the normalized ballot image. */
export interface InterpretedContestLayout {
  contestId: string;
  bounds: Rect;
  options: InterpretedContestOptionLayout[];
}

/** An array of optional marks and their corresponding grid positions. */
export type ScoredBubbleMarks = Array<
  [gridPosition: GridPosition, scoredBubbleMark: Optional<ScoredBubbleMark>]
>;

/** A region of a ballot position that has a computed score. */
export interface ScoredPositionArea {
  gridPosition: GridPosition;
  bounds: Rect;
  score: UnitIntervalScore;
}

/**
 * Represents a grid of timing marks and provides access to the expected
 * location of bubbles in the grid. Note that all coordinates are based in an
 * image that may have been rotated, cropped, and scaled. To recreate the image
 * that corresponds to the grid, follow these steps starting with the original:
 *   1. rotate 180 degrees if `orientation` is `PortraitReversed`.
 *   2. crop the image edges by `borderInset`.
 *   3. scale the image to `scaledSize`.
 */
export interface TimingMarkGrid {
  /** The geometry of the ballot card. */
  geometry: Geometry;

  /** Timing marks found by examining the image. */
  partialTimingMarks: PartialTimingMarks;

  /** Timing marks inferred from the partial timing marks. */
  completeTimingMarks: CompleteTimingMarks;

  /** Areas of the ballot card that contain shapes that may be timing marks. */
  candidateTimingMarks: Rect[];
}

/** Metadata from the ballot card. */
export type BallotPageMetadata =
  | BallotPageTimingMarkMetadata
  | BallotPageQrCodeMetadata;

/** Metadata from a ballot card QR code. */
export interface BallotPageQrCodeMetadata extends HmpbBallotPageMetadata {
  source: 'qr-code';
}

/** Metadata from the ballot card bottom timing marks. */
export type BallotPageTimingMarkMetadata = (BallotConfig | ElectionInfo) & {
  source: 'timing-marks';
};

/** Metadata encoded on the front side of a ballot card. */
export interface BallotConfig {
  side: 'front';

  /** Batch or precinct number from bits 2-14 (13 bits). */
  batchOrPrecinct: u16;

  /** Card number (CardRotID) from bits 15-27 (13 bits). */
  card: u16;

  /** Sequence number (always 0) from bits 28-30 (3 bits). */
  sequence: u8;
}

/** Metadata encoded on the front side of a ballot card. */
export interface ElectionInfo {
  side: 'back';

  /** Election day of month (1..31) from bits 0-4 (5 bits). */
  day: u8;

  /** Election month (1..12) from bits 5-8 (4 bits). */
  month: u8;

  /** Election year (2 digits) from bits 9-15 (7 bits). */
  year: u8;

  /**
   * Election type from bits 16-20 (5 bits).
   *
   * @example "G" for general election
   */
  typeCode: IndexedCapitalLetter;
}

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

/** Represents partial timing marks found in a ballot card. */
export interface PartialTimingMarks {
  geometry: Geometry;
  topLeftCorner: Point<SubPixelUnit>;
  topRightCorner: Point<SubPixelUnit>;
  bottomLeftCorner: Point<SubPixelUnit>;
  bottomRightCorner: Point<SubPixelUnit>;
  topRects: Rect[];
  bottomRects: Rect[];
  leftRects: Rect[];
  rightRects: Rect[];
  topLeftRect?: Rect;
  topRightRect?: Rect;
  bottomLeftRect?: Rect;
  bottomRightRect?: Rect;
}

/** Represents complete, possibly inferred timing marks found in a ballot card. */
export interface CompleteTimingMarks {
  geometry: Geometry;
  topLeftCorner: Point<SubPixelUnit>;
  topRightCorner: Point<SubPixelUnit>;
  bottomLeftCorner: Point<SubPixelUnit>;
  bottomRightCorner: Point<SubPixelUnit>;
  topRects: Rect[];
  bottomRects: Rect[];
  leftRects: Rect[];
  rightRects: Rect[];
  topLeftRect: Rect;
  topRightRect: Rect;
  bottomLeftRect: Rect;
  bottomRightRect: Rect;
}

/** Location and score information for a ballot contest option's bubble. */
export interface ScoredBubbleMark {
  /**
   * The location of the bubble mark in the grid. Uses side/column/row, not
   * x/y.
   */
  location: GridLocation;

  /**
   * The score for the match between the source image and the template. This
   * is the highest value found when looking around `expectedBounds` for the
   * bubble. 100% is a perfect match.
   */
  matchScore: UnitIntervalScore;

  /**
   * The score for the fill of the bubble at `matchedBounds`. 100% is
   * perfectly filled.
   */
  fillScore: UnitIntervalScore;

  /**
   * The expected bounds of the bubble mark in the scanned source image.
   */
  expectedBounds: Rect;

  /**
   * The bounds of the bubble mark in the scanned source image that was
   * determined to be the best match.
   */
  matchedBounds: Rect;
}

/**
 * A value between 0 and 1, inclusive.
 *
 * Because this is just a type alias it does not enforce that another type
 * with the same underlying representation is not used.
 */
export type UnitIntervalValue = f32;

/** Alias used for an bubble mark's score values. */
export type UnitIntervalScore = UnitIntervalValue;

/** Coordinates specifying a timing mark intersection on the ballot card. */
export interface GridLocation {
  side: BallotSide;
  column: GridUnit;
  row: GridUnit;
}

/**
 * Possible sides of a card, used when we know a side is the front or back and
 * not just "side A" or "side B".
 */
export enum BallotSide {
  Front = 'front',
  Back = 'back',
}

/**
 * Information about the size and number of various physical features on a
 * ballot card.
 */
export interface Geometry {
  ballotPaperSize: BallotPaperSize;
  pixelsPerInch: PixelUnit;
  canvasSize: Size<PixelUnit>;
  contentArea: Rect;
  timingMarkSize: Size<SubPixelUnit>;
  gridSize: Size<GridUnit>;
}

/** Ballot card orientation. */
export enum Orientation {
  /** The ballot card is portrait and right-side up. */
  Portrait = 'portrait',

  /** The ballot card is portrait and upside down. */
  PortraitReversed = 'portrait-reversed',
}

/** A coordinate in a grid. Units are typically either pixels or timing marks. */
export interface Point<T> {
  x: T;
  y: T;
}

/** A rectangle in a grid. Units are typically either pixels or timing marks. */
export interface Rect {
  left: PixelPosition;
  top: PixelPosition;
  width: PixelUnit;
  height: PixelUnit;
}

/** A size in a grid. Units are typically either pixels or timing marks. */
export interface Size<T> {
  width: T;
  height: T;
}

/**
 * Possible errors that can occur when interpreting a ballot card.
 */
export type InterpretError =
  | { type: 'imageOpenFailure'; path: string }
  | { type: 'borderInsetNotFound'; path: string }
  | {
      type: 'invalidCardMetadata';
      side_a: BallotPageTimingMarkMetadata;
      side_b: BallotPageTimingMarkMetadata;
    }
  | { type: 'invalidMetadata'; path: string; error: BallotPageMetadataError }
  | {
      type: 'mismatchedBallotCardGeometries';
      side_a: BallotPagePathAndGeometry;
      side_b: BallotPagePathAndGeometry;
    }
  | {
      type: 'missingGridLayout';
      front: BallotPageTimingMarkMetadata;
      back: BallotPageTimingMarkMetadata;
    }
  | { type: 'missingTimingMarks'; rects: Rect[] }
  | { type: 'unexpectedDimensions'; path: string; dimensions: Size<PixelUnit> }
  | { type: 'unknown'; message: string };

/**
 * Information about a ballot page that has failed to be interpreted.
 */
export interface BallotPagePathAndGeometry {
  path: string;
  geometry: Geometry;
}

/**
 * Possible metadata decode errors.
 */
export type BallotPageMetadataError =
  | {
      type: 'valueOutOfRange';
      field: string;
      value: u32;
      min: u32;
      max: u32;
      metadata: BallotPageTimingMarkMetadata;
    }
  | { type: 'invalidChecksum'; metadata: BallotConfig }
  | { type: 'invalidEnderCode'; metadata: ElectionInfo }
  | { type: 'invalidTimingMarkCount'; expected: usize; actual: usize }
  | {
      type: 'ambiguousMetadata';
      front_metadata: BallotConfig;
      back_metadata: ElectionInfo;
    };
