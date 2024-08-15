import {
  CompleteTimingMarks,
  Point,
  Rect,
  Size,
} from '@votingworks/ballot-interpreter';
import { assertDefined } from '@votingworks/basics';
import { NewType } from '@votingworks/types';

/**
 * Alias for number in a ballot grid.
 */
export type BallotGridValue = NewType<number, 'BallotGridValue'>;

/**
 * Alias for number in an image grid.
 */
export type ImageGridValue = NewType<number, 'ImageGridValue'>;

/**
 * Alias for number in a PDF grid.
 */
export type PdfGridValue = NewType<number, 'PdfGridValue'>;

/**
 * A point on a ballot grid.
 */
export type BallotGridPoint = Point<BallotGridValue>;

/**
 * A point in an image.
 */
export type ImagePoint = Point<ImageGridValue>;

/**
 * A point in a PDF.
 */
export type PdfPoint = Point<PdfGridValue>;

/**
 * A size in a ballot grid coordinate system.
 */
export type BallotGridSize = Size<BallotGridValue>;

/**
 * A size in an image coordinate system.
 */
export type ImageSize = Size<ImageGridValue>;

/**
 * A size in a PDF coordinate system.
 */
export type PdfSize = Size<PdfGridValue>;

/**
 * A rect in a ballot grid coordinate system.
 */
export type BallotGridRect = Rect<BallotGridValue>;

/**
 * A rect in an image coordinate system.
 */
export type ImageRect = Rect<ImageGridValue>;

/**
 * A rect in a PDF coordinate system.
 */
export type PdfRect = Rect<PdfGridValue>;

/**
 * Creates a new ballot grid point. Do not use this for conversion from another
 * coordinate system.
 */
export function newBallotGridPoint(x: number, y: number): BallotGridPoint {
  return { x, y } as unknown as BallotGridPoint;
}

/**
 * Creates a new image point. Do not use this for conversion from another
 * coordinate system.
 */
export function newImagePoint(x: number, y: number): ImagePoint {
  return { x, y } as unknown as ImagePoint;
}

/**
 * Creates a new PDF point. Do not use this for conversion from another
 * coordinate system.
 */
export function newPdfPoint(x: number, y: number): PdfPoint {
  return { x, y } as unknown as PdfPoint;
}

/**
 * Creates a new ballot grid size. Do not use this for conversion from another
 * coordinate system.
 */
export function newBallotGridSize(
  width: number,
  height: number
): BallotGridSize {
  return { width, height } as unknown as BallotGridSize;
}

/**
 * Creates a new image size. Do not use this for conversion from another
 * coordinate system.
 */
export function newImageSize(width: number, height: number): ImageSize {
  return { width, height } as unknown as ImageSize;
}

/**
 * Creates a new PDF size. Do not use this for conversion from another
 * coordinate system.
 */
export function newPdfSize(width: number, height: number): PdfSize {
  return { width, height } as unknown as PdfSize;
}

/**
 * Gets the center of a rect.
 */
export function rectCenter<T extends number>(rect: Rect<T>): Point<T> {
  // This happens to be the same for grid, image, and PDF coordinates even
  // though the Y-axis is flipped in PDF coordinates.
  return {
    x: (rect.left + rect.width / 2) as T,
    y: (rect.top + rect.height / 2) as T,
  };
}

/**
 * Adds a point to a size as a vector to get a new point.
 */
export function vecAdd<T extends number>(
  point: Point<T>,
  size: Size<T>
): Point<T> {
  return {
    x: (point.x + size.width) as T,
    y: (point.y + size.height) as T,
  };
}

/**
 * Convert a ballot grid point to an image point.
 */
export function ballotGridPointToImagePoint(
  completeTimingMarks: CompleteTimingMarks,
  { x, y }: BallotGridPoint
): ImagePoint {
  const leftRect = assertDefined(completeTimingMarks.leftRects[y]);
  const topRect = assertDefined(completeTimingMarks.topRects[x]);

  return newImagePoint(
    topRect.left + topRect.width / 2,
    leftRect.top + leftRect.height / 2
  );
}

/**
 * Convert a point in an image to a point in a PDF.
 */
export function imagePointToPdfPoint(
  pdfSize: PdfSize,
  imagePointsPerInch: number,
  pdfPointsPerInch: number,
  imagePoint: ImagePoint
): PdfPoint {
  const x = (imagePoint.x / imagePointsPerInch) * pdfPointsPerInch;
  // Flip the y-axis.
  const y =
    pdfSize.height - (imagePoint.y / imagePointsPerInch) * pdfPointsPerInch;
  return newPdfPoint(x, y);
}

/**
 * Convert a point in a PDF to a point in an image.
 */
export function pdfPointToImagePoint(
  pdfSize: PdfSize,
  imagePointsPerInch: number,
  pdfPointsPerInch: number,
  pdfPoint: PdfPoint
): ImagePoint {
  const x = (pdfPoint.x / pdfPointsPerInch) * imagePointsPerInch;
  // Flip the y-axis.
  const y =
    ((pdfSize.height - pdfPoint.y) / pdfPointsPerInch) * imagePointsPerInch;
  return newImagePoint(x, y);
}

/**
 * Convert a size in an image to a size in a PDF.
 */
export function imageSizeToPdfSize(
  imagePointsPerInch: number,
  pdfPointsPerInch: number,
  imageSize: ImageSize
): PdfSize {
  const width = (imageSize.width / imagePointsPerInch) * pdfPointsPerInch;
  const height = (imageSize.height / imagePointsPerInch) * pdfPointsPerInch;
  return newPdfSize(width, height);
}

/**
 * Convert a size in a PDF to a size in an image.
 */
export function pdfSizeToImageSize(
  imagePointsPerInch: number,
  pdfPointsPerInch: number,
  pdfSize: PdfSize
): ImageSize {
  const width = (pdfSize.width / pdfPointsPerInch) * imagePointsPerInch;
  const height = (pdfSize.height / pdfPointsPerInch) * imagePointsPerInch;
  return newImageSize(width, height);
}

/**
 * Calculates the distance between two points.
 */
export function distance<T extends number>(a: Point<T>, b: Point<T>): T {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2) as T;
}
