import {
  binarize,
  crop,
  diff,
  getImageChannelCount,
  otsu,
  outline,
  PIXEL_BLACK,
  PIXEL_WHITE,
  ratio,
} from '@votingworks/image-utils';
import { GridLayout } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { BallotCardGeometry, InterpretedOvalMark, Point } from '../types';
import { loc, makeRect, vec } from '../utils';
import { InterpretBallotCardLayoutResult } from './interpret_ballot_card_layout';

/**
 * Score oval mark at a given location.
 */
export function scoreOvalMark(
  imageData: ImageData,
  ovalTemplate: ImageData,
  ovalTopLeftPoint: Point,
  geometry: BallotCardGeometry,
  threshold: number
): Omit<InterpretedOvalMark, 'gridPosition'> {
  const maximumOffset = 7;
  const outlinedOvalTemplate = outline(binarize(ovalTemplate, threshold));
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
      const cropped = crop(imageData, ovalRect);
      const croppedAndBinarizedWithImageThreshold = binarize(
        cropped,
        threshold
      );
      const croppedAndBinarizedIndependently = binarize(cropped);

      // determine whether this offset lines up well with the template
      const matchScore = Math.max(
        ratio(
          diff(croppedAndBinarizedWithImageThreshold, outlinedOvalTemplate),
          // brighter image means a better match with the template
          { color: PIXEL_WHITE }
        ),
        ratio(
          diff(croppedAndBinarizedIndependently, outlinedOvalTemplate),
          // brighter image means a better match with the template
          { color: PIXEL_WHITE }
        )
      );

      if (matchScore > maximumMatchScore) {
        // it's better than the previous best match, so use it
        maximumMatchScore = matchScore;
        bestMatchRect = ovalRect;

        // compute the new fill score based on how much of the oval is filled in
        const fillScore = ratio(
          diff(outlinedOvalTemplate, croppedAndBinarizedWithImageThreshold),
          // darker image means more of the bubble is filled in
          { color: PIXEL_BLACK }
        );
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
  ovalTemplate: ImageData;
  imageData: ImageData;
  layout: InterpretBallotCardLayoutResult;
  gridLayout: GridLayout;
}): InterpretedOvalMark[] {
  const { grid } = layout;
  const threshold = otsu(imageData.data, getImageChannelCount(imageData));

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
          threshold
        ),
      };
    }
  );
}

/**
 * Interprets a ballot sheet scan's oval marks.
 */
export function interpretOvalMarks({
  geometry,
  ovalTemplate,
  frontImageData,
  backImageData,
  frontLayout,
  backLayout,
  gridLayout,
}: {
  geometry: BallotCardGeometry;
  ovalTemplate: ImageData;
  frontImageData: ImageData;
  backImageData: ImageData;
  frontLayout: InterpretBallotCardLayoutResult;
  backLayout: InterpretBallotCardLayoutResult;
  gridLayout: GridLayout;
}): InterpretedOvalMark[] {
  const frontImageChannels = getImageChannelCount(frontImageData);
  const backImageChannels = getImageChannelCount(backImageData);
  assert(
    frontImageChannels === backImageChannels,
    `frontImageChannels ${frontImageChannels} !== backImageChannels ${backImageChannels}`
  );

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
