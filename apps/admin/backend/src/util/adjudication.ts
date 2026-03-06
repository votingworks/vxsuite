import { Id, Rect } from '@votingworks/types';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import { assertDefined } from '@votingworks/basics';
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

  let front: BallotPageImage | undefined;
  let back: BallotPageImage | undefined;

  for (const { image, layout, side } of imagesAndLayouts) {
    const imageData = await loadImageData(image);
    const imageUrl = imageData.isOk()
      ? toDataUrl(imageData.ok(), 'image/jpeg')
      : null;
    const ballotCoordinates: Rect = {
      x: 0,
      y: 0,
      width: imageData.isOk() ? imageData.ok().width : 0,
      height: imageData.isOk() ? imageData.ok().height : 0,
    };
    const pageImage: BallotPageImage = layout
      ? { type: 'hmpb', imageUrl, ballotCoordinates, layout }
      : { type: 'bmd', imageUrl, ballotCoordinates };

    if (side === 'front') {
      front = pageImage;
    } else {
      back = pageImage;
    }
  }

  debug('retrieved ballot images for cvr %s', cvrId);
  return { cvrId, front: assertDefined(front), back: assertDefined(back) };
}
