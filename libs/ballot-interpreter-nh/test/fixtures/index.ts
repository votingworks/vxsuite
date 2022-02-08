import { assert } from '@votingworks/utils';
import { Debugger } from '../../src/debug';
import {
  CompleteTimingMarks,
  Rect,
  Size,
  ThirtyTwoBits,
} from '../../src/types';
import { makeRect } from '../../src/utils';

/**
 * The size of an 8.5" x 11" letter-size ballot card template.
 */
export const LetterTemplateCanvasSize: Size = { width: 684, height: 1080 };

/**
 * The area inside a letter-size template that is meant to be printed.
 */
export const LetterTemplateBallotRect = makeRect({
  minX: 38,
  minY: 63,
  maxX: 646,
  maxY: 1016,
});

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
}

/**
 * Generates timing mark rectangles for a ballot card.
 */
export function generateTimingMarkRects({
  canvasSize,
  ballotRect,
  timingMarkSize,
  timingMarkGapSize,
}: {
  canvasSize: Size;
  ballotRect: Rect;
  timingMarkSize: Size;
  timingMarkGapSize: Size;
}): GeneratedTimingMarks {
  const maximumHorizontalTimingMarkCount = Math.floor(
    (ballotRect.width + timingMarkSize.width) /
      (timingMarkSize.width + timingMarkGapSize.width)
  );
  const maximumVerticalTimingMarkCount = Math.floor(
    (ballotRect.height + timingMarkSize.height) /
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
    ballotRect.width -
    (maximumHorizontalTimingMarkCount * timingMarkSize.width +
      (maximumHorizontalTimingMarkCount - 1) * timingMarkGapSize.width);
  const remainingVerticalSpace =
    ballotRect.height -
    (maximumVerticalTimingMarkCount * timingMarkSize.height +
      (maximumVerticalTimingMarkCount - 1) * timingMarkGapSize.height);

  assert(remainingHorizontalSpace >= 0, `the ballot card is too small`);
  assert(remainingVerticalSpace >= 0, `the ballot card is too small`);

  const horizontalInsetLeft = Math.floor(remainingHorizontalSpace / 2);
  const verticalInsetTop = Math.floor(remainingVerticalSpace / 2);

  const topLeft = timingMarkAt(
    ballotRect.minX + horizontalInsetLeft,
    ballotRect.minY + verticalInsetTop,
    timingMarkSize
  );
  const topRight = timingMarkAt(
    ballotRect.maxX +
      1 -
      (remainingHorizontalSpace - horizontalInsetLeft) -
      timingMarkSize.width,
    ballotRect.minY + verticalInsetTop,
    timingMarkSize
  );
  const bottomLeft = timingMarkAt(
    topLeft.x,
    ballotRect.maxY +
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
  };
}

/**
 * Generates timing mark rectangles for a letter-size ballot card.
 */
export function generateTemplateTimingMarkRects(): GeneratedTimingMarks {
  return generateTimingMarkRects({
    canvasSize: LetterTemplateCanvasSize,
    ballotRect: LetterTemplateBallotRect,
    timingMarkSize: TimingMarkSize,
    timingMarkGapSize: TimingMarkGapSize,
  });
}

function returnThis<T>(this: T): T {
  return this;
}

/**
 * Builds a no-op debugger for passing to code with image debugging.
 */
export function noDebug(): Debugger {
  return {
    layer: returnThis,
    layerEnd: returnThis,
    image: returnThis,
    imageData: returnThis,
    line: returnThis,
    rect: returnThis,
    text: returnThis,
  };
}

/**
 * The bit data represented as missing/present timing marks on the Hudson ballot
 * card front. The bits are in LSB to MSB order, the opposite of the order of
 * the timing marks on a right-side up card.
 */
export const HudsonFrontPageBottomTimingMarkBits: ThirtyTwoBits = [
  1, 0, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
];

/**
 * The bit data represented as missing/present timing marks on the Hudson ballot
 * card back. The bits are in LSB to MSB order, the opposite of the order of
 * the timing marks on a right-side up card.
 */
export const HudsonBackPageBottomTimingMarkBits: ThirtyTwoBits = [
  1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1,
  0, 1, 1, 1, 1, 0,
];
