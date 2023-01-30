import { Debugger, noDebug, rotate180 } from '@votingworks/image-utils';
import {
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  ElectionDefinition,
} from '@votingworks/types';
import { map, reversed } from '@votingworks/basics';
import makeDebug from 'debug';
import { ContestShape, findContests } from './hmpb/find_contests';
import { findContestOptions } from './hmpb/find_contest_options';
import { findTargets } from './hmpb/find_targets';
import { detect } from './metadata';
import { binarize } from './utils/binarize';

const debug = makeDebug('ballot-interpreter-vx:layout');

/**
 * Normalize a ballot image and its metadata. This will mutate the provided
 * image, so make a copy if you need to keep the original.
 */
export async function normalizeImageDataAndMetadata({
  electionDefinition,
  imageData,
  flipped = false,
  metadata,
}: {
  electionDefinition: ElectionDefinition;
  imageData: ImageData;
  flipped?: boolean;
  metadata?: BallotPageMetadata;
}): Promise<{ imageData: ImageData; metadata: BallotPageMetadata }> {
  binarize(imageData);

  if (metadata) {
    if (flipped) {
      rotate180(imageData);
    }

    return { imageData, metadata };
  }

  const detectResult = await detect(electionDefinition, imageData);

  if (detectResult.flipped) {
    debug('detected image is flipped, correcting orientation');
    rotate180(imageData);
  }

  return { imageData, metadata: detectResult.metadata };
}

/**
 * Find contests in a ballot image, either with two or three columns.
 */
export function findContestsWithUnknownColumnLayout(
  imageData: ImageData,
  { imdebug = noDebug() }: { imdebug?: Debugger } = {}
): {
  contests: ContestShape[];
  columns: number;
} {
  // Try three columns, i.e. candidate pages.
  const shapesWithThreeColumns = imdebug.capture(
    'findContests-3-column',
    () => [
      ...findContests(imageData, {
        columns: [true, true, true],
        imdebug,
      }),
    ]
  );

  if (shapesWithThreeColumns.length > 0) {
    return { contests: shapesWithThreeColumns, columns: 3 };
  }

  // Try two columns, i.e. measure pages.
  return {
    contests: imdebug.capture('findContests-2-column', () => [
      ...findContests(imageData, {
        columns: [true, true],
        imdebug,
      }),
    ]),
    columns: 2,
  };
}

/**
 * Interprets an image as a template, returning the layout information read
 * from the image. The template image should be an image of a blank ballot,
 * i.e. rendered as an image from a PDF.
 */
export async function interpretTemplate({
  electionDefinition,
  imageData,
  metadata,
  imdebug = noDebug(),
}: {
  electionDefinition: ElectionDefinition;
  imageData: ImageData;
  metadata?: BallotPageMetadata;
  imdebug?: Debugger;
}): Promise<BallotPageLayoutWithImage> {
  debug(
    'interpretTemplate: looking for contests in %d×%d image',
    imageData.width,
    imageData.height
  );
  const normalized = await normalizeImageDataAndMetadata({
    electionDefinition,
    imageData,
    metadata,
  });

  debug('using metadata for template: %O', normalized.metadata);

  const contests = findContestOptions([
    ...map(
      findContestsWithUnknownColumnLayout(normalized.imageData).contests,
      ({ bounds, corners }) => ({
        bounds,
        corners,
        targets: imdebug.capture('targets', () => [
          ...reversed(
            findTargets(normalized.imageData, bounds, {
              targetMarkPosition:
                electionDefinition.election.ballotLayout?.targetMarkPosition,
              imdebug,
            })
          ),
        ]),
      })
    ),
  ]);

  return {
    imageData: normalized.imageData,
    ballotPageLayout: {
      pageSize: {
        width: normalized.imageData.width,
        height: normalized.imageData.height,
      },
      metadata: normalized.metadata,
      contests,
    },
  };
}
