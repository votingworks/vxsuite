import { ContestId, Id } from '@votingworks/types';
import { loadImageMetadata } from '@votingworks/image-utils';
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

  const metadata = await loadImageMetadata(image);
  const imageUrl = metadata.isOk()
    ? `data:${metadata.ok().type};base64,${image.toString('base64')}`
    : null;

  // BMD ballots do not have layouts, we do not support zoom during adjudication on these ballots.
  if (layout === undefined) {
    return {
      type: 'bmd',
      cvrId,
      imageUrl,
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
  return {
    type: 'hmpb',
    cvrId,
    imageUrl,
    ballotCoordinates: {
      width: metadata.ok()?.width ?? 0,
      height: metadata.ok()?.height ?? 0,
      x: 0,
      y: 0,
    },
    contestCoordinates: contestLayout.bounds,
    optionLayouts: contestLayout.options,
    side,
  };
}
