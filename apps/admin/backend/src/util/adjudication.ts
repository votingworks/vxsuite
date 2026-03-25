import { Id, mapSheet, Rect } from '@votingworks/types';
import { loadImageMetadata } from '@votingworks/image-utils';
import { Store } from '../store';
import { BallotImages, BallotPageImage } from '../types';
import { rootDebug } from './debug';

const debug = rootDebug.extend('adjudication');

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
  );

  debug('retrieved ballot images for cvr %s', cvrId);
  return { cvrId, front, back };
}
