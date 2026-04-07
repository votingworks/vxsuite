import { Buffer } from 'node:buffer';
import { BallotPageLayout, Id, mapSheet, Rect, Side } from '@votingworks/types';
import { loadImageMetadata } from '@votingworks/image-utils';
import { Store } from '../store';
import { BallotImages, BallotPageImage } from '../types';
import { rootDebug } from './debug';

const debug = rootDebug.extend('adjudication');

/**
 * Builds a {@link BallotPageImage} from an image buffer and optional layout.
 */
async function buildBallotPageImage(
  image: Buffer,
  layout?: BallotPageLayout,
  imageUrl?: string
): Promise<BallotPageImage> {
  const metadata = await loadImageMetadata(image);
  const ballotCoordinates: Rect = {
    x: 0,
    y: 0,
    width: metadata.ok()?.width ?? 0,
    height: metadata.ok()?.height ?? 0,
  };
  return layout
    ? { type: 'hmpb', imageUrl, ballotCoordinates, layout }
    : { type: 'bmd', imageUrl, ballotCoordinates };
}

/**
 * Retrieves both sides of a ballot's images and layouts.
 */
export async function getBallotImages({
  store,
  cvrId,
}: {
  store: Store;
  cvrId: Id;
}): Promise<BallotImages> {
  debug('getting ballot images for cvr %s...', cvrId);
  const imagesAndLayouts = store.getBallotImagesAndLayouts({ cvrId });

  const [front, back] = await mapSheet(
    imagesAndLayouts,
    async ({ image, layout }): Promise<BallotPageImage> => {
      const metadata = await loadImageMetadata(image);
      const imageUrl = metadata.isOk()
        ? `data:${metadata.ok().type};base64,${image.toString('base64')}`
        : undefined;
      return buildBallotPageImage(image, layout, imageUrl);
    }
  );

  debug('retrieved ballot images for cvr %s', cvrId);
  return { cvrId, front, back };
}

/**
 * Returns the raw image buffer and content type for one side of a ballot.
 */
export async function getBallotImageBuffer({
  store,
  cvrId,
  side,
}: {
  store: Store;
  cvrId: Id;
  side: Side;
}): Promise<{ buffer: Buffer; contentType: string } | undefined> {
  debug('getting ballot image buffer for cvr %s, side %s...', cvrId, side);
  const imagesAndLayouts = store.getBallotImagesAndLayouts({ cvrId });
  const { image } =
    side === 'front' ? imagesAndLayouts[0] : imagesAndLayouts[1];
  const metadata = await loadImageMetadata(image);
  /* istanbul ignore next - corrupted image data @preserve */
  if (metadata.isErr()) return undefined;
  return { buffer: image, contentType: metadata.ok().type };
}

/**
 * Returns ballot image metadata (layout, coordinates) for both sides,
 * without embedding the full image data. The caller provides a function
 * to generate the imageUrl for each side.
 */
export async function getBallotImageMetadata({
  store,
  cvrId,
  buildImageUrl,
}: {
  store: Store;
  cvrId: Id;
  buildImageUrl: (side: Side) => string;
}): Promise<BallotImages> {
  debug('getting ballot image metadata for cvr %s...', cvrId);
  const imagesAndLayouts = store.getBallotImagesAndLayouts({ cvrId });

  const [front, back] = await mapSheet(
    imagesAndLayouts,
    async ({ image, layout }, side): Promise<BallotPageImage> =>
      buildBallotPageImage(image, layout, buildImageUrl(side))
  );

  debug('retrieved ballot image metadata for cvr %s', cvrId);
  return { cvrId, front, back };
}
