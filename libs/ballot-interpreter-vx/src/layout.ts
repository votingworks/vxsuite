import {
  Debugger,
  noDebug,
  PdfPage,
  pdfToImages,
  rotate180,
} from '@votingworks/image-utils';
import {
  BallotMetadata,
  BallotPageLayoutWithImage,
  BallotPageMetadata,
  ElectionDefinition,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { assert, iter } from '@votingworks/basics';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import { ImageData } from 'canvas';
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
  contestOffset,
  imdebug = noDebug(),
}: {
  electionDefinition: ElectionDefinition;
  imageData: ImageData;
  contestOffset: number;
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

  const contestShapes = findContestsWithUnknownColumnLayout(
    normalized.imageData
  ).contests;

  // determine the sequence of contest ids that the discovered contest shapes
  // will belong to
  const { election } = electionDefinition;
  const ballotStyle = getBallotStyle({
    ballotStyleId: normalized.metadata.ballotStyleId,
    election,
  });
  assert(ballotStyle);
  const contestIds = getContests({
    ballotStyle,
    election,
  })
    .map((contest) => contest.id)
    .slice(contestOffset, contestOffset + contestShapes.length);

  const contests = findContestOptions(
    iter(contestShapes)
      .zip(contestIds)
      .map(([{ bounds, corners }, contestId]) => ({
        contestId,
        bounds,
        corners,
        targets: imdebug.capture('targets', () =>
          iter(
            findTargets(normalized.imageData, bounds, {
              targetMarkPosition:
                electionDefinition.election.ballotLayout?.targetMarkPosition,
              imdebug,
            })
          )
            .rev()
            .toArray()
        ),
      }))
      .toArray()
  );

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

/**
 * Interprets rendered PDF pages as templates, returning the layout information
 * read from the images. The template images should be images of blank ballots,
 * i.e. rendered as images from a PDF.
 */
export async function* interpretMultiPageTemplate({
  electionDefinition,
  pages,
  metadata,
}: {
  electionDefinition: ElectionDefinition;
  pages: AsyncIterable<PdfPage>;
  metadata?: BallotMetadata;
}): AsyncIterable<BallotPageLayoutWithImage> {
  let contestOffset = 0;
  for await (const { page, pageNumber } of pages) {
    const layoutWithImage = await interpretTemplate({
      electionDefinition,
      imageData: page,
      contestOffset,
      metadata: metadata ? { ...metadata, pageNumber } : undefined,
    });

    contestOffset += layoutWithImage.ballotPageLayout.contests.length;
    yield {
      ...layoutWithImage,
      ballotPageLayout: {
        ...layoutWithImage.ballotPageLayout,
        metadata: {
          ...layoutWithImage.ballotPageLayout.metadata,
          ...(metadata ?? {}),
          pageNumber,
        },
      },
    };
  }
}

/**
 * Interprets a PDF as a series of templates, returning the layout information
 * read from the images.
 */
export async function* interpretMultiPagePdfTemplate({
  electionDefinition,
  ballotPdfData,
  metadata,
  scale = 2,
}: {
  electionDefinition: ElectionDefinition;
  ballotPdfData: Buffer;
  metadata: BallotMetadata;
  scale?: number;
}): AsyncIterable<BallotPageLayoutWithImage> {
  yield* interpretMultiPageTemplate({
    electionDefinition,
    pages: pdfToImages(ballotPdfData, { scale }),
    metadata,
  });
}
