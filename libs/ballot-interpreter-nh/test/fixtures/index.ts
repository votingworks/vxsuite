import { toImageData } from '@votingworks/image-utils';
import { BallotPaperSize } from '@votingworks/types';
import { assert, throwIllegalValue } from '@votingworks/basics';
import { DOMParser } from '@xmldom/xmldom';
import { Image } from 'canvas';
import { BallotCardTemplateMargins } from '../../src/accuvote';
import { NewHampshireBallotCardDefinition } from '../../src/convert';
import {
  BallotCardGeometry,
  CompleteTimingMarks,
  Rect,
  Size,
  ThirtyTwoBits,
} from '../../src/types';
import { makeRect } from '../../src/utils';

/**
 * The size of a single timing mark.
 */
export const TimingMarkSize: Size = { width: 14, height: 4 };

/**
 * The size of the gaps between the timing marks.
 */
export const TimingMarkGapSize: Size = {
  width: TimingMarkSize.height,
  height: TimingMarkSize.width,
};

function timingMarkAt(x: number, y: number, timingMarkSize: Size): Rect {
  return makeRect({
    minX: x,
    minY: y,
    maxX: x + timingMarkSize.width - 1,
    maxY: y + timingMarkSize.height - 1,
  });
}

/**
 * Generated timing marks for testing purposes.
 */
export interface GeneratedTimingMarks {
  readonly complete: CompleteTimingMarks;
  readonly allRects: readonly Rect[];
  readonly canvasSize: Size;
  readonly geometry: BallotCardGeometry;
}

/**
 * Generates timing mark rectangles for a ballot card.
 */
export function generateTimingMarkRects({
  pixelsPerInch,
  ballotPaperSize,
  timingMarkSize,
  timingMarkGapSize,
}: {
  pixelsPerInch: number;
  ballotPaperSize: BallotPaperSize;
  timingMarkSize: Size;
  timingMarkGapSize: Size;
}): GeneratedTimingMarks {
  const widthInInches =
    ballotPaperSize === BallotPaperSize.Letter ||
    ballotPaperSize === BallotPaperSize.Legal ||
    ballotPaperSize === BallotPaperSize.Custom8Point5X17
      ? 9.5
      : throwIllegalValue(ballotPaperSize);
  const heightInInches =
    ballotPaperSize === BallotPaperSize.Letter
      ? 12
      : ballotPaperSize === BallotPaperSize.Legal
      ? 15
      : ballotPaperSize === BallotPaperSize.Custom8Point5X17
      ? 18
      : throwIllegalValue(ballotPaperSize);

  const canvasSize: Size = {
    width: Math.round(widthInInches * pixelsPerInch),
    height: Math.round(heightInInches * pixelsPerInch),
  };
  const contentArea = makeRect({
    minX: Math.round(pixelsPerInch * BallotCardTemplateMargins.width),
    minY: Math.round(pixelsPerInch * BallotCardTemplateMargins.height),
    maxX: Math.round(
      pixelsPerInch * (widthInInches - BallotCardTemplateMargins.width) - 1
    ),
    maxY: Math.round(
      pixelsPerInch * (heightInInches - BallotCardTemplateMargins.height) - 1
    ),
  });

  const maximumHorizontalTimingMarkCount = Math.floor(
    (contentArea.width + timingMarkSize.width) /
      (timingMarkSize.width + timingMarkGapSize.width)
  );
  const maximumVerticalTimingMarkCount = Math.floor(
    (contentArea.height + timingMarkSize.height) /
      (timingMarkSize.height + timingMarkGapSize.height)
  );

  assert(
    maximumHorizontalTimingMarkCount > 1,
    `the ballot card is too small to contain horizontal timing marks`
  );
  assert(
    maximumVerticalTimingMarkCount > 1,
    `the ballot card is too small to contain vertical timing marks`
  );

  const remainingHorizontalSpace =
    contentArea.width -
    (maximumHorizontalTimingMarkCount * timingMarkSize.width +
      (maximumHorizontalTimingMarkCount - 1) * timingMarkGapSize.width);
  const remainingVerticalSpace =
    contentArea.height -
    (maximumVerticalTimingMarkCount * timingMarkSize.height +
      (maximumVerticalTimingMarkCount - 1) * timingMarkGapSize.height);

  assert(remainingHorizontalSpace >= 0, `the ballot card is too small`);
  assert(remainingVerticalSpace >= 0, `the ballot card is too small`);

  const horizontalInsetLeft = Math.floor(remainingHorizontalSpace / 2);
  const verticalInsetTop = Math.floor(remainingVerticalSpace / 2);

  const topLeft = timingMarkAt(
    contentArea.minX + horizontalInsetLeft,
    contentArea.minY + verticalInsetTop,
    timingMarkSize
  );
  const topRight = timingMarkAt(
    contentArea.maxX +
      1 -
      (remainingHorizontalSpace - horizontalInsetLeft) -
      timingMarkSize.width,
    contentArea.minY + verticalInsetTop,
    timingMarkSize
  );
  const bottomLeft = timingMarkAt(
    topLeft.x,
    contentArea.maxY +
      1 -
      (remainingVerticalSpace - verticalInsetTop) -
      timingMarkSize.height,
    timingMarkSize
  );
  const bottomRight = timingMarkAt(topRight.x, bottomLeft.y, timingMarkSize);
  const corners = [topLeft, topRight, bottomLeft, bottomRight];

  assert(
    topLeft.x +
      (maximumHorizontalTimingMarkCount - 1) *
        (timingMarkSize.width + timingMarkGapSize.width) ===
      topRight.x,
    `the timing marks are not evenly spaced horizontally: ${topLeft.x} + ${
      maximumHorizontalTimingMarkCount - 1
    } * ${timingMarkSize.width + timingMarkGapSize.width} (${
      topLeft.x +
      (maximumHorizontalTimingMarkCount - 1) *
        (timingMarkSize.width + timingMarkGapSize.width)
    }) !== ${topRight.x}`
  );
  assert(
    topLeft.y +
      (maximumVerticalTimingMarkCount - 1) *
        (timingMarkSize.height + timingMarkGapSize.height) ===
      bottomLeft.y,
    `the timing marks are not evenly spaced vertically: ${topLeft.y} + ${
      maximumVerticalTimingMarkCount - 1
    } * ${timingMarkSize.height + timingMarkGapSize.height} (${
      topLeft.y +
      (maximumVerticalTimingMarkCount - 1) *
        (timingMarkSize.height + timingMarkGapSize.height)
    }) != ${bottomLeft.y}`
  );

  const topWithoutCorners: Rect[] = [];
  const bottomWithoutCorners: Rect[] = [];

  for (
    let x = topLeft.x + timingMarkSize.width + timingMarkGapSize.width;
    x < topRight.x;
    x += timingMarkSize.width + timingMarkGapSize.width
  ) {
    topWithoutCorners.push(timingMarkAt(x, topLeft.y, timingMarkSize));
    bottomWithoutCorners.push(timingMarkAt(x, bottomLeft.y, timingMarkSize));
  }

  const leftWithoutCorners: Rect[] = [];
  const rightWithoutCorners: Rect[] = [];

  for (
    let y = topLeft.y + timingMarkSize.height + timingMarkGapSize.height;
    y < bottomLeft.y;
    y += timingMarkSize.height + timingMarkGapSize.height
  ) {
    leftWithoutCorners.push(timingMarkAt(topLeft.x, y, timingMarkSize));
    rightWithoutCorners.push(timingMarkAt(topRight.x, y, timingMarkSize));
  }

  const gridSize: Size = {
    width: topWithoutCorners.length + 2,
    height: leftWithoutCorners.length + 2,
  };

  const ovalSize: Size = {
    width: timingMarkSize.width,
    height: Math.round(timingMarkSize.height) * 2,
  };

  const frontFooterHeightInTimingMarks = 2;
  const frontUsableArea = makeRect({
    minX: 1,
    minY: 1,
    maxX: gridSize.width - 2,
    maxY: gridSize.height - 2 - frontFooterHeightInTimingMarks,
  });

  const backUsableArea = makeRect({
    minX: 1,
    minY: 1,
    maxX: gridSize.width - 2,
    maxY: gridSize.height - 2,
  });

  const geometry: BallotCardGeometry = {
    ballotPaperSize,
    pixelsPerInch,
    canvasSize,
    contentArea,
    gridSize,
    timingMarkSize,
    ovalSize,
    frontUsableArea,
    backUsableArea,
  };

  return {
    canvasSize,
    complete: {
      topLeft,
      topRight,
      bottomLeft,
      bottomRight,
      left: [topLeft, ...leftWithoutCorners, bottomLeft],
      right: [topRight, ...rightWithoutCorners, bottomRight],
      top: [topLeft, ...topWithoutCorners, topRight],
      bottom: [bottomLeft, ...bottomWithoutCorners, bottomRight],
    },
    allRects: [
      ...corners,
      ...topWithoutCorners,
      ...bottomWithoutCorners,
      ...leftWithoutCorners,
      ...rightWithoutCorners,
    ],
    geometry,
  };
}

/**
 * Generates timing mark rectangles for a letter-size ballot card.
 */
export function generateTemplateTimingMarkRects(): GeneratedTimingMarks {
  return generateTimingMarkRects({
    pixelsPerInch: 72,
    ballotPaperSize: BallotPaperSize.Letter,
    timingMarkSize: TimingMarkSize,
    timingMarkGapSize: TimingMarkGapSize,
  });
}

/**
 * The bit data represented as missing/present timing marks on the Hudson ballot
 * card front. The bits are in LSB to MSB order, the opposite of the order of
 * the timing marks on a right-side up card.
 */
export const Hudson03Nov2020FrontPageBottomTimingMarkBits: ThirtyTwoBits = [
  1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
];

/**
 * The bit data represented as missing/present timing marks on the Hudson ballot
 * card back. The bits are in LSB to MSB order, the opposite of the order of
 * the timing marks on a right-side up card.
 */
export const Hudson03Nov2020BackPageBottomTimingMarkBits: ThirtyTwoBits = [
  1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 0,
];

/**
 * Returns a parsed XML document for the given fixture data.
 */
export function readFixtureDefinition(xml: string): Element {
  return new DOMParser().parseFromString(xml).documentElement;
}

/**
 * Reads a grayscale image from the given path.
 */
export function readFixtureImage(
  image: Image,
  geometry: BallotCardGeometry
): ImageData {
  return toImageData(image, {
    maxWidth: geometry.canvasSize.width,
    maxHeight: geometry.canvasSize.height,
  });
}

/**
 * Reads the XML definition and image data for a fixture.
 */
export function readFixtureBallotCardDefinition(
  xml: string,
  frontImage: Image,
  backImage: Image,
  geometry: BallotCardGeometry
): NewHampshireBallotCardDefinition {
  return {
    definition: readFixtureDefinition(xml),
    front: readFixtureImage(frontImage, geometry),
    back: readFixtureImage(backImage, geometry),
  };
}
