import {
  BallotPageLayout,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  ImageData,
} from '@votingworks/types';

export function getMockBallotPageLayout(
  metadata: BallotPageMetadata
): BallotPageLayout {
  return {
    pageSize: { width: 1, height: 1 },
    metadata,
    contests: [],
  };
}

export function getMockImageData(width = 1, height = 1): ImageData {
  return {
    data: Uint8ClampedArray.of(0, 0, 0, 0),
    width,
    height,
  };
}

export function getMockBallotPageLayoutWithImage(
  metadata: BallotPageMetadata
): BallotPageLayoutWithImage {
  return {
    imageData: getMockImageData(),
    ballotPageLayout: getMockBallotPageLayout(metadata),
  };
}
