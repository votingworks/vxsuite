import {
  binarize,
  getImageChannelCount,
  simpleRemoveNoise,
} from '@votingworks/image-utils';
import { GridLayout } from '@votingworks/types';
import { assert } from '@votingworks/utils';
import { matchTemplateImage, scoreTemplateMatch } from '../images';
import { BallotCardGeometry, InterpretedOvalMark } from '../types';
import { loc, makeRect, vec } from '../utils';
import { InterpretBallotCardLayoutResult } from './interpret_ballot_card_layout';

/**
 * Interprets a ballot scan page's oval marks.
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

  const ovalMask = binarize(ovalTemplate);
  const frontGrid = frontLayout.grid;
  const backGrid = backLayout.grid;

  return gridLayout.gridPositions.map<InterpretedOvalMark>((gridPosition) => {
    const [imageData, grid] =
      gridPosition.side === 'front'
        ? [frontImageData, frontGrid]
        : [backImageData, backGrid];

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
    let minimumScore = 1;
    let minimumScoreRect = makeRect({
      minX: ovalTopLeftPoint.x,
      minY: ovalTopLeftPoint.y,
      maxX: ovalTopLeftPoint.x + geometry.ovalSize.width - 1,
      maxY: ovalTopLeftPoint.y + geometry.ovalSize.height - 1,
    });
    let minimumScoredOffset = vec(0, 0);
    for (let xOffset = -3; xOffset <= 3; xOffset += 1) {
      for (let yOffset = -3; yOffset <= 3; yOffset += 1) {
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
        const matched = binarize(
          matchTemplateImage(imageData, ovalTemplate, loc(x, y))
        );
        const ovalMatch = simpleRemoveNoise(matched, 255, 2);
        const score = scoreTemplateMatch(ovalMatch, ovalMask);
        if (score < minimumScore) {
          minimumScore = score;
          minimumScoreRect = ovalRect;
          minimumScoredOffset = vec(xOffset, yOffset);
        }
      }
    }

    return {
      gridPosition,
      score: minimumScore,
      bounds: minimumScoreRect,
      scoredOffset: minimumScoredOffset,
    };
  });
}
