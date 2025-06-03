import { ContestId, Id } from '@votingworks/types';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import { Store } from '../store';
import { BallotImageView } from '../types';
import { rootDebug } from './debug';

const debug = rootDebug.extend('adjudication');

/**
 * Retrieves data necessary to display a ballot image on the frontend.
 */
export async function getBallotImageView({
  store,
  cvrId,
  contestId,
}: {
  store: Store;
  cvrId: Id;
  contestId: ContestId;
}): Promise<BallotImageView> {
  debug('creating image view for %s...', contestId);
  const imageDetails = store.getBallotImageAndLayout({ contestId, cvrId });
  const { layout, image, side } = imageDetails;

  // BMD ballots do not have layouts, we do not support zoom during adjudication on these ballots.
  if (layout === undefined) {
    return {
      type: 'bmd',
      cvrId,
      imageUrl: toDataUrl(await loadImageData(image), 'image/jpeg'),
      side: 'front',
    };
  }

  // identify the contest layout
  const contestLayout = layout.contests.find(
    (contest) => contest.contestId === contestId
  );
  /* istanbul ignore next - TODO: revisit our layout assumptions based on our new ballots @preserve */
  if (!contestLayout) {
    throw new Error('unable to find a layout for the specified contest');
  }

  debug('created image view');
  const imageData = await loadImageData(image);
  return {
    type: 'hmpb',
    cvrId,
    imageUrl: toDataUrl(imageData, 'image/jpeg'),
    ballotCoordinates: {
      width: imageData.width,
      height: imageData.height,
      x: 0,
      y: 0,
    },
    contestCoordinates: contestLayout.bounds,
    optionLayouts: contestLayout.options,
    side,
  };
}
