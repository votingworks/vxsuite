/* eslint-disable @typescript-eslint/no-use-before-define */

import * as cv from '@u4/opencv4nodejs';

import { err, ok, Result } from '@votingworks/types';
import { assert } from '@votingworks/utils';

import { Bit, Rect, Vector } from '../../types';
import { vec } from '../../utils';
import { GRAYSCALE_BLACK, GRAYSCALE_WHITE } from './constants';
import { MarginType, PageMargins, TimingMarks } from './types';

/**
 * Sets all pixel values below a determined brightness threshold tp white and
 * all other pixel values to black, using the Otsu threshold algorith:
 * https://en.wikipedia.org/wiki/Otsu%27s_method}
 */
export async function binarizeImage(
  image: cv.Mat,
  options: { blurSize?: number } = {}
): Promise<cv.Mat> {
  const { blurSize = 2 } = options;
  // Recommendation from openCV: make binarization a little more effective by
  // slightly blurring to remove noise:
  // FIXME: magic constants
  const denoisedImage =
    blurSize > 0
      ? await image.blurAsync(new cv.Size(blurSize, blurSize))
      : image;

  return denoisedImage.thresholdAsync(
    0,
    GRAYSCALE_WHITE,
    cv.THRESH_BINARY_INV | cv.THRESH_OTSU
  );
}

/** TODO */
export async function getShadedPixelRatio(
  image: cv.Mat,
  options: { blurSize?: number; testBounds?: cv.Rect } = {}
): Promise<number> {
  const { blurSize, testBounds } = options;

  const binarizedImage = await binarizeImage(image, { blurSize });

  const testRegion = testBounds
    ? binarizedImage.getRegion(testBounds)
    : binarizedImage;

  const numNonZeroPixels = await testRegion.countNonZeroAsync();

  return numNonZeroPixels / (testRegion.cols * testRegion.rows);
}

/** TODO */
export function decodeBitsFromBottomTimingMarks(
  timingMarks: TimingMarks
): Bit[] {
  const { detected, interpolated } = timingMarks;

  const leftBorderMark = detected[0];
  const rightBorderMark = detected[detected.length - 1];
  const bitMarks = detected.slice(1, -1).map((m) => m.boundingRect());
  const bitPlaceholders = interpolated.slice(1, -1);

  assert(leftBorderMark);
  assert(rightBorderMark);

  const decodedBits: Bit[] = Array.from<Bit>({
    length: bitPlaceholders.length,
  }).fill(0);

  let markIndex = 0;
  for (let bitIndex = 0; bitIndex < bitPlaceholders.length; bitIndex += 1) {
    if (markIndex >= bitMarks.length) {
      break;
    }

    const bitMark = bitMarks[markIndex];
    const bitPlaceholder = bitPlaceholders[bitIndex];
    assert(bitMark);
    assert(bitPlaceholder);

    if (getRectCenter(bitMark).x < bitPlaceholder.x + bitPlaceholder.width) {
      decodedBits[bitIndex] = 1;
      markIndex += 1;
    }
  }

  return decodedBits;
}

/** TODO */
export function findMinOrMaxContour(
  contours: cv.Contour[],
  query: { x: 'min' | 'max'; y: 'min' | 'max' }
): Result<cv.Contour, string> {
  if (contours.length === 0) {
    return err('contour list is empty');
  }

  let currentPick = contours[0];
  assert(currentPick);

  const xMultiplier = query.x === 'min' ? 1 : -1;
  const yMultiplier = query.y === 'min' ? 1 : -1;
  for (const candidate of contours) {
    const currentPickLocation = getRectOrigin(currentPick.boundingRect());
    const candidateLocation = getRectOrigin(candidate.boundingRect());

    const currentPickScore =
      currentPickLocation.x * xMultiplier + currentPickLocation.y * yMultiplier;
    const candidateScore =
      candidateLocation.x * xMultiplier + candidateLocation.y * yMultiplier;

    if (candidateScore < currentPickScore) {
      currentPick = candidate;
    }
  }

  return ok(currentPick);
}

/** TODO */
export function getRectCenter(r: cv.Rect): cv.Point2 {
  return new cv.Point2(r.x + r.width / 2, r.y + r.height / 2);
}

/** TODO */
export function getRectOrigin(r: cv.Rect): cv.Point2 {
  return new cv.Point2(r.x, r.y);
}

/** TODO */
export function toVxRect(r: cv.Rect): Rect {
  const centerPoint = getRectCenter(r);

  return {
    height: r.height,
    maxX: r.x + r.width,
    maxY: r.y + r.height,
    minX: r.x,
    minY: r.y,
    width: r.width,
    x: centerPoint.x,
    y: centerPoint.y,
  };
}

/** TODO */
export function toVxVector(p: cv.Point2): Vector {
  return vec(p.x, p.y);
}

/** TODO */
export function getDistancesBetweenTimingMarks(marks: cv.Rect[]): cv.Point2[] {
  const distances: cv.Point2[] = [];

  const innerMarks = marks.length > 2 ? marks.slice(1, -1) : marks;

  for (let i = 1; i < innerMarks.length; i += 1) {
    const currentMark = innerMarks[i];
    const previousMark = innerMarks[i - 1];

    assert(currentMark);
    assert(previousMark);

    distances.push(getDistanceBetweenRects(previousMark, currentMark));
  }

  return distances;
}

/** TODO */
export function translateRect(rect: cv.Rect, offset: cv.Point2): cv.Rect {
  return new cv.Rect(
    rect.x + offset.x,
    rect.y + offset.y,
    rect.width,
    rect.height
  );
}

/** Returns the distance between centers of the given rectangles. */
export function getDistanceBetweenRects(from: cv.Rect, to: cv.Rect): cv.Point2 {
  return getRectCenter(to).sub(getRectCenter(from));
}

/** TODO */
export async function mapMargins<U, T>(
  margins: PageMargins<U>,
  fn: (margin: U, marginType: MarginType) => Promise<T>
): Promise<PageMargins<T>> {
  const [bottom, left, right, top] = await Promise.all([
    fn(margins.bottom, 'bottom'),
    fn(margins.left, 'left'),
    fn(margins.right, 'right'),
    fn(margins.top, 'top'),
  ]);

  return {
    bottom,
    left,
    right,
    top,
  };
}

/** TODO */
export async function padImage(
  image: cv.Mat,
  padding: Partial<PageMargins<number>>,
  color = GRAYSCALE_BLACK
): Promise<cv.Mat> {
  return await image.copyMakeBorderAsync(
    padding.top ?? 0,
    padding.bottom ?? 0,
    padding.left ?? 0,
    padding.right ?? 0,
    cv.BORDER_CONSTANT,
    color
  );
}

/** TODO */
export function average(...values: number[]): number {
  return (
    values.reduce((totalSoFar, value) => totalSoFar + value) / values.length
  );
}

/** TODO */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Estimates the area within the convex bounds of the given contour that are
 * filled. Not as accurate as counting the non-zero pixels in a binarized image
 * region, but useful for distinguishing text from a timing mark, for example.
 */
export function estimateContourFillRatio(contour: cv.Contour): number {
  return Math.abs(contour.area) / Math.abs(contour.convexHull().area);
}
