import { assert, iter } from '@votingworks/basics';
import { Id, safeParseNumber } from '@votingworks/types';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import { Store } from '../store';
import { WriteInImageView } from '../types';
import { rootDebug } from './debug';

const debug = rootDebug.extend('write-ins');

/**
 * Retrieves data necessary to display a write-in image on the frontend.
 */
export async function getWriteInImageView({
  store,
  writeInId,
}: {
  store: Store;
  writeInId: Id;
}): Promise<WriteInImageView> {
  debug('creating write-in image view for %s...', writeInId);
  const writeInDetails = store.getWriteInImageAndLayout(writeInId);
  const { layout, image, contestId, optionId, cvrId, machineMarkedText, side } =
    writeInDetails;

  // BMD ballots do not have layouts, we do not support zoom during WIA on these ballots.
  if (layout === undefined) {
    assert(
      machineMarkedText !== undefined,
      'cvr validation on import guarantees machineMarkedText or layout is defined'
    );
    return {
      type: 'bmd',
      writeInId,
      optionId,
      cvrId,
      imageUrl: toDataUrl(await loadImageData(image), 'image/jpeg'),
      machineMarkedText,
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

  // identify the write-in option layout
  const writeInOptions = contestLayout.options.filter(
    (option) => option.definition && option.definition.id.startsWith('write-in')
  );
  const writeInOptionIndex = safeParseNumber(
    optionId.slice('write-in-'.length)
  );
  /* istanbul ignore next - TODO: revisit our layout assumptions based on our new ballots @preserve */
  if (writeInOptionIndex.isErr() || writeInOptions === undefined) {
    throw new Error('unable to interpret layout write-in options');
  }

  const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
  /* istanbul ignore next - TODO: revisit our layout assumptions based on our new ballots @preserve */
  if (writeInLayout === undefined) {
    throw new Error('unexpected write-in option index');
  }

  debug('created write-in image view');
  const imageData = await loadImageData(image);
  return {
    type: 'hmpb',
    writeInId,
    cvrId,
    optionId,
    imageUrl: toDataUrl(imageData, 'image/jpeg'),
    ballotCoordinates: {
      width: imageData.width,
      height: imageData.height,
      x: 0,
      y: 0,
    },
    contestCoordinates: contestLayout.bounds,
    writeInCoordinates: writeInLayout.bounds,
    side,
  };
}

/**
 * Retrieves data necessary to display write-in images on the frontend for a given Cvr contest.
 */
export async function getCvrContestWriteInImageViews({
  store,
  cvrId,
  contestId,
}: {
  store: Store;
  cvrId: Id;
  contestId: Id;
}): Promise<WriteInImageView[]> {
  return await iter(store.getCvrContestWriteInIds({ cvrId, contestId }))
    .async()
    .map((writeInId) => getWriteInImageView({ store, writeInId }))
    .toArray();
}
