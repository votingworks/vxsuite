import { assert } from '@votingworks/basics';
import {
  AnyImage,
  otsu,
  writeImage,
  PIXEL_BLACK,
  PIXEL_WHITE,
} from '@votingworks/image-utils';
import { GridLayout, GridPosition } from '@votingworks/types';
import { format } from '@votingworks/utils';
import makeDebug, { Debugger } from 'debug';
import { BallotCardGeometry, InterpretedOvalMark, Point } from '../types';
import { loc, makeRect, vec } from '../utils';
import { InterpretBallotCardLayoutResult } from './interpret_ballot_card_layout';

const DEBUG_NAMESPACE_PREFIX = 'ballot-interpreter-nh:oval-marks:';

function makeGridPositionDebug(gridPosition: GridPosition): Debugger {
  const label = `${DEBUG_NAMESPACE_PREFIX}${gridPosition.side}-row=${
    gridPosition.column
  }-column=${gridPosition.row}-${gridPosition.contestId}-${
    gridPosition.type === 'option'
      ? gridPosition.optionId
      : `write-in-${gridPosition.writeInIndex}`
  }`;

  return makeDebug(label);
}

function writeDebugImage(debug: Debugger, image: AnyImage, name: string): void {
  if (debug.enabled) {
    const filePath = `./debug-${debug.namespace.slice(
      DEBUG_NAMESPACE_PREFIX.length + 1
    )}-${name}.png`;
    debug(`%s`, filePath);
    void writeImage(filePath, image);
  }
}

/**
 * Score oval mark at a given location.
 */
export function scoreOvalMark(
  imageData: AnyImage,
  ovalTemplate: AnyImage,
  ovalTopLeftPoint: Point,
  geometry: BallotCardGeometry,
  threshold: number,
  debug: Debugger
): Omit<InterpretedOvalMark, 'gridPosition'> {
  const maximumOffset = 7;
  const outlinedOvalTemplate = ovalTemplate
    .binarize(threshold)
    .outline({ color: PIXEL_BLACK });
  let maximumMatchScore = 0;
  let bestMatchRect = makeRect({
    minX: ovalTopLeftPoint.x,
    minY: ovalTopLeftPoint.y,
    maxX: ovalTopLeftPoint.x + geometry.ovalSize.width - 1,
    maxY: ovalTopLeftPoint.y + geometry.ovalSize.height - 1,
  });
  let bestMatchOffset = vec(0, 0);
  let bestMatchFillScore = 0;
  for (let xOffset = -maximumOffset; xOffset <= maximumOffset; xOffset += 1) {
    for (let yOffset = -maximumOffset; yOffset <= maximumOffset; yOffset += 1) {
      const x = ovalTopLeftPoint.x + xOffset;
      const y = ovalTopLeftPoint.y + yOffset;

      if (
        x < 0 ||
        y < 0 ||
        x >= geometry.canvasSize.width ||
        y >= geometry.canvasSize.height
      ) {
        continue;
      }

      const ovalRect = makeRect({
        minX: x,
        minY: y,
        maxX: x + geometry.ovalSize.width - 1,
        maxY: y + geometry.ovalSize.height - 1,
      });
      const cropped = imageData.crop(ovalRect);
      const croppedAndBinarized = cropped.binarize(threshold);
      const matchDiff = croppedAndBinarized.diff(outlinedOvalTemplate);
      // determine whether this offset lines up well with the template
      const matchScore =
        matchDiff.count({ color: PIXEL_WHITE }) / matchDiff.length;

      writeDebugImage(debug, cropped, `offset=(${xOffset},${yOffset})-cropped`);
      writeDebugImage(
        debug,
        croppedAndBinarized,
        `offset=(${xOffset},${yOffset})-croppedAndBinarized`
      );
      writeDebugImage(
        debug,
        matchDiff,
        `offset=(${xOffset},${yOffset})-matchDiff-${format.percent(matchScore, {
          maximumFractionDigits: 2,
        })}`
      );

      if (debug.enabled) {
        const fillDiff = outlinedOvalTemplate.diff(croppedAndBinarized);
        // darker image means more of the bubble is filled in
        const fillScore =
          fillDiff.count({ color: PIXEL_BLACK }) / fillDiff.length;
        writeDebugImage(
          debug,
          fillDiff,
          `offset=(${xOffset},${yOffset})-fillDiff-${format.percent(fillScore, {
            maximumFractionDigits: 2,
          })}`
        );
      }

      if (matchScore > maximumMatchScore) {
        // it's better than the previous best match, so use it
        maximumMatchScore = matchScore;
        bestMatchRect = ovalRect;

        // compute the new fill score based on how much of the oval is filled in
        const fillDiff = outlinedOvalTemplate.diff(croppedAndBinarized);
        // darker image means more of the bubble is filled in
        const fillScore =
          fillDiff.count({ color: PIXEL_BLACK }) / fillDiff.length;
        bestMatchFillScore = fillScore;
        bestMatchOffset = vec(xOffset, yOffset);
      }
    }
  }

  return {
    score: bestMatchFillScore,
    bounds: bestMatchRect,
    scoredOffset: bestMatchOffset,
  };
}

/**
 * Interprets a ballot page scan's oval marks.
 */
export function interpretPageOvalMarks({
  geometry,
  ovalTemplate,
  imageData,
  layout,
  gridLayout,
}: {
  geometry: BallotCardGeometry;
  ovalTemplate: AnyImage;
  imageData: AnyImage;
  layout: InterpretBallotCardLayoutResult;
  gridLayout: GridLayout;
}): InterpretedOvalMark[] {
  const { grid } = layout;
  const threshold = otsu(imageData);

  if (
    ovalTemplate.width !== geometry.ovalSize.width ||
    ovalTemplate.height !== geometry.ovalSize.height
  ) {
    throw new Error(
      `Oval template size (${ovalTemplate.width}x${ovalTemplate.height}) does not match expected size (${geometry.ovalSize.width}x${geometry.ovalSize.height})`
    );
  }

  return gridLayout.gridPositions.flatMap<InterpretedOvalMark>(
    (gridPosition) => {
      if (gridPosition.side !== layout.side) {
        return [];
      }

      const ovalCenter = grid.rows[gridPosition.row]?.[gridPosition.column];
      assert(
        ovalCenter,
        `Missing oval center for side=${gridPosition.side}, column=${
          gridPosition.column
        }, row=${gridPosition.row}, contestId=${gridPosition.contestId} ${
          gridPosition.type === 'option'
            ? `optionId=${gridPosition.optionId}`
            : `writeInIndex=${gridPosition.writeInIndex}`
        }`
      );

      const ovalTopLeftPoint = loc(
        Math.floor(ovalCenter.x - geometry.ovalSize.width / 2),
        Math.floor(ovalCenter.y - geometry.ovalSize.height / 2)
      );

      return {
        gridPosition,
        ...scoreOvalMark(
          imageData,
          ovalTemplate,
          ovalTopLeftPoint,
          geometry,
          threshold,
          makeGridPositionDebug(gridPosition)
        ),
      };
    }
  );
}

/**
 * Interprets a ballot sheet scan's oval marks.
 */
export function interpretOvalMarks<I extends AnyImage>({
  geometry,
  ovalTemplate,
  frontImageData,
  backImageData,
  frontLayout,
  backLayout,
  gridLayout,
}: {
  geometry: BallotCardGeometry;
  ovalTemplate: AnyImage;
  frontImageData: I;
  backImageData: I;
  frontLayout: InterpretBallotCardLayoutResult;
  backLayout: InterpretBallotCardLayoutResult;
  gridLayout: GridLayout;
}): InterpretedOvalMark[] {
  const frontMarks = interpretPageOvalMarks({
    geometry,
    ovalTemplate,
    imageData: frontImageData,
    layout: frontLayout,
    gridLayout,
  });
  const backMarks = interpretPageOvalMarks({
    geometry,
    ovalTemplate,
    imageData: backImageData,
    layout: backLayout,
    gridLayout,
  });

  return [...frontMarks, ...backMarks];
}
