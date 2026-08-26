import {
  HmpbBallotPaperSize,
  GridPosition,
  HmpbBallotPageMetadata,
  PrecinctId,
  BallotStyleId,
  Side,
  BallotType,
  ContestId,
} from '@votingworks/types';
import { Optional, Result } from '@votingworks/basics';

/*
 * Many of these types are from the Rust code.
 *
 * IF YOU CHANGE ANYTHING HERE, YOU MUST ALSO CHANGE IT THERE.
 */

/** Rust u32 mapped to TypeScript. */
export type u32 = number;

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
 * A fractional position in the timing-mark grid (e.g. a bubble that sits
 * partway between two rows). Mirrors the Rust `SubGridUnit` type alias.
 */
export type SubGridUnit = f32;

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

/**
 * The raw JSON shape returned by the Rust napi-rs bridge before being wrapped
 * in a `Result`. This is the actual runtime type; `HmpbInterpretResult` is
 * produced by calling `ok()`/`err()` on this value.
 */
export type BridgeInterpretResult =
  | { type: 'ok'; value: InterpretedBallotCard }
  | { type: 'err'; value: InterpretError };

/** A successfully interpreted ballot card. */
export interface InterpretedBallotCard {
  front: InterpretedBallotPage;
  back: InterpretedBallotPage;
}

/** A successfully imported ballot page. */
export interface InterpretedBallotPage {
  timingMarks: TimingMarks;
  metadata: BallotPageMetadata;
  marks: ScoredBubbleMarks;
  writeIns: ScoredPositionArea[];
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
  shape: Quadrilateral;
  score: UnitIntervalScore;
}

/** Metadata from the ballot card. */
export type BallotPageMetadata = BallotPageQrCodeMetadata;

/** Metadata from a ballot card QR code. */
export interface BallotPageQrCodeMetadata extends HmpbBallotPageMetadata {
  source: 'qr-code';
}

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
export interface TimingMarks {
  geometry: Geometry;
  topLeftCorner: Point<SubPixelUnit>;
  topRightCorner: Point<SubPixelUnit>;
  bottomLeftCorner: Point<SubPixelUnit>;
  bottomRightCorner: Point<SubPixelUnit>;
  topLeftMark: CandidateTimingMark;
  topRightMark: CandidateTimingMark;
  bottomLeftMark: CandidateTimingMark;
  bottomRightMark: CandidateTimingMark;
  borderMarks: BorderMarks;
}

/**
 * The per-border timing-mark sequences. Only the borders parallel to the scan
 * direction (currently left and right) are recorded; the grid is reconstructed
 * from those plus the four corner marks.
 */
export interface BorderMarks {
  left: CandidateTimingMark[];
  right: CandidateTimingMark[];
}

/** A possible timing mark. */
export interface CandidateTimingMark {
  rect: Rect;
  scores: TimingMarkScore;
}

/** Scores for how closely a timing mark matches the expected shape. */
export interface TimingMarkScore {
  markScore: f32;
  paddingScore: f32;
}

/** Location and score information for a ballot contest option's bubble. */
export interface ScoredBubbleMark {
  /**
   * The location of the bubble mark in the grid. Uses side/column/row, not
   * x/y.
   */
  location: GridLocation;

  /**
   * The score for the match between the source image and the template: the
   * fraction of the template area where the scan does not contradict the
   * template. This is the highest value found when looking around
   * `expectedBounds` for the bubble. 100% is a perfect match, but the score
   * cannot drop below the template's blank-paper fraction (roughly two
   * thirds), because those pixels count no matter what the scan holds there.
   * Deliberately insensitive to how filled the bubble is — it measures
   * alignment only.
   */
  matchScore: UnitIntervalScore;

  /**
   * The score for the fill of the bubble at `matchedBounds`: the fraction of
   * the template area covered by ink the blank template does not have. Only
   * the template's blank-paper pixels can contribute, so the score is capped
   * at that fraction of the template area — roughly two thirds — and a
   * completely filled bubble scores near that cap rather than at 100%. Mark
   * thresholds are calibrated on this scale.
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
  ballotPaperSize: HmpbBallotPaperSize;
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

/** A quadrilateral defined by four points, i.e. a four-sided polygon. */
export interface Quadrilateral {
  topLeft: Point<SubPixelUnit>;
  topRight: Point<SubPixelUnit>;
  bottomLeft: Point<SubPixelUnit>;
  bottomRight: Point<SubPixelUnit>;
}

export function getQuadrilateralBounds(q: Quadrilateral): Rect {
  const left = Math.floor(Math.min(q.topLeft.x, q.bottomLeft.x));
  const top = Math.floor(Math.min(q.topLeft.y, q.topRight.y));
  const right = Math.ceil(Math.max(q.topRight.x, q.bottomRight.x));
  const bottom = Math.ceil(Math.max(q.bottomLeft.y, q.bottomRight.y));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

/** A size in a grid. Units are typically either pixels or timing marks. */
export interface Size<T> {
  width: T;
  height: T;
}

/**
 * Identifies a single field that differs between the two sides of a bubble
 * ballot sheet, carrying the value found on each side.
 */
export type MetadataMismatch =
  | { type: 'ballotHash'; sideA: string; sideB: string }
  | { type: 'precinctId'; sideA: PrecinctId; sideB: PrecinctId }
  | { type: 'ballotStyleId'; sideA: BallotStyleId; sideB: BallotStyleId }
  | { type: 'pageNumber'; sideA: number; sideB: number }
  | { type: 'isTestMode'; sideA: boolean; sideB: boolean }
  | { type: 'ballotType'; sideA: BallotType; sideB: BallotType }
  | {
      type: 'ballotAuditId';
      sideA: string | null;
      sideB: string | null;
    };

/**
 * Possible errors that can occur when interpreting a ballot card.
 *
 * `isBubbleBallot` is set by the Rust interpreter and is true when the error
 * definitively identifies the ballot as a bubble ballot rather than a summary
 * ballot. When true, summary ballot interpretation can be skipped.
 */
export type InterpretError = { isBubbleBallot: boolean } & (
  | { type: 'borderInsetNotFound'; path: string }
  | { type: 'invalidQrCodeMetadata'; label: string; message: string }
  | {
      type: 'mismatchedBallotMetadata';
      sideA: HmpbBallotPageMetadata;
      sideB: HmpbBallotPageMetadata;
      mismatches: MetadataMismatch[];
    }
  | { type: 'invalidBallotHash'; expected: string; actual: string }
  | {
      type: 'mismatchedBallotCardGeometries';
      side_a: BallotPagePathAndGeometry;
      side_b: BallotPagePathAndGeometry;
    }
  | {
      type: 'missingGridLayout';
      front: BallotPageMetadata;
      back: BallotPageMetadata;
    }
  | { type: 'missingTimingMarks'; reason: string }
  | { type: 'unexpectedDimensions'; label: string; dimensions: Size<PixelUnit> }
  | { type: 'invalidScale'; label: string; scale: number }
  | { type: 'couldNotComputeLayout'; side: Side }
  | {
      type: 'gridPositionOutsideTimingMarkGrid';
      label: string;
      contestId: ContestId;
      column: SubGridUnit;
      row: SubGridUnit;
    }
  | {
      type: 'verticalStreaksDetected';
      label: string;
      xCoordinates: PixelPosition[];
    }
  | {
      type: 'invalidElection';
      message: string;
    }
);

/**
 * Information about a ballot page that has failed to be interpreted.
 */
export interface BallotPagePathAndGeometry {
  path: string;
  geometry: Geometry;
}

/**
 * Rust-decoded vote types. Uses serde `tag = "type"` discriminators
 * and camelCase field names.
 */
export type RustCandidateVote =
  | { type: 'namedCandidate'; candidateId: string }
  | { type: 'writeInCandidate'; candidateId: string; name: string };

export type RustContestVote =
  | { type: 'candidate'; value: RustCandidateVote[] }
  | { type: 'yesNo'; value: string[] }
  | { type: 'straightParty'; value: string[] };

/**
 * Rust-decoded CastVoteRecord (VS\x01 prelude).
 */
export interface RustCastVoteRecord {
  ballotHash: number[];
  ballotStyleId: string;
  precinctId: string;
  pageNumber: number;
  totalPages: number;
  votes: Record<string, RustContestVote>;
  isTestMode: boolean;
  ballotType: string;
  ballotAuditId: string;
  contestIds: string[];
}

/**
 * Result of decoding raw BMD ballot bytes via the Rust decoder.
 */
export type BridgeDecodeBmdResult = RustCastVoteRecord;

/**
 * Rust-decoded bubble ballot page metadata (VB\x01 prelude). The ballot hash
 * is the partial hash as a hex string, not the full election ballot hash.
 */
export interface RustBubbleBallotMetadata {
  ballotHash: string;
  precinctId: string;
  ballotStyleId: string;
  pageNumber: number;
  isTestMode: boolean;
  ballotType: string;
  ballotAuditId?: string;
}

/**
 * Result of decoding raw bubble ballot metadata bytes via the Rust decoder.
 */
export type BridgeDecodeBubbleBallotMetadataResult = RustBubbleBallotMetadata;
