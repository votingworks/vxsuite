import * as cv from '@u4/opencv4nodejs';

import {
  GridLayout,
  GridPosition,
  HmpbBallotPageMetadata,
  PageInterpretation,
  Result,
} from '@votingworks/types';

/** TODO */
export interface PageImageData {
  binarizedImage: cv.Mat;
  optimizedImage: cv.Mat;
  originalImage: cv.Mat;
}

/** Single page interpretation result. */
export interface OpenCvInterpretResult {
  interpretation: PageInterpretation;
  normalizedImageFilePath: string;
  originalImageFilePath: string;
}

/** TODO */
export interface PageRegion {
  image: cv.Mat;
  offset: cv.Point2;
}

/** TODO */
export interface PageMargins<T> {
  bottom: T;
  left: T;
  right: T;
  top: T;
}

/** TODO */
export type MarginType = keyof PageMargins<unknown>;

/** TODO */
export interface PotentialTimingMarks {
  allContours: cv.Contour[];
  potentialMarks: cv.Contour[];
}

/** TODO */
export interface DetectedTimingMarks {
  marginImage: PageRegion;
  marginType: MarginType;
  marks: cv.Contour[];
  medianHeight: number;
  medianSpacing: number;
  medianWidth: number;
  // pageRegion: PageRegion;
}

/** TODO */
export interface TimingMarks {
  detected: cv.Contour[];
  first: cv.Rect;
  interpolated: cv.Rect[];
  last: cv.Rect;
  medianSpacing: number;
  marginType: MarginType;
}

/** TODO */
export type BallotMetadata = Pick<
  HmpbBallotPageMetadata,
  'ballotStyleId' | 'ballotType' | 'electionHash' | 'isTestMode' | 'precinctId'
> & {
  gridLayout: GridLayout;
};

/** TODO */
export interface OvalTemplate {
  image: cv.Mat;
  shadedPixelRatio: number;
}

/** TODO */
export interface OvalMark {
  readonly gridPosition: GridPosition;
  readonly expectedBounds: Result<cv.Rect, string>;
  readonly matchBounds: Result<cv.Rect, string>;
  readonly score: number;
  readonly searchBounds: Result<cv.Rect, string>;
}
