import { assertDefined, find } from '@votingworks/basics';
import { Id, safeParseNumber } from '@votingworks/types';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import { Store } from '../store';
import { WriteInAdjudicationContext, WriteInImageView } from '../types';
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
  const { layout, image, contestId, optionId, cvrId, machineMarkedText } =
    writeInDetails;

  // BMD ballots do not have layouts, we do not support zoom during WIA on these ballots.
  if (layout === undefined) {
    return {
      writeInId,
      cvrId,
      imageUrl: toDataUrl(await loadImageData(image), 'image/jpeg'),
      ballotCoordinates: {
        ...layout.pageSize,
        x: 0,
        y: 0,
      },
      machineMarkedText: machineMarkedText || '',
    };
  }

  // identify the contest layout
  const contestLayout = layout.contests.find(
    (contest) => contest.contestId === contestId
  );
  /* c8 ignore next 3 - TODO: revisit our layout assumptions based on our new ballots */
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
  /* c8 ignore next 3 - TODO: revisit our layout assumptions based on our new ballots */
  if (writeInOptionIndex.isErr() || writeInOptions === undefined) {
    throw new Error('unable to interpret layout write-in options');
  }

  const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
  /* c8 ignore next 3 - TODO: revisit our layout assumptions based on our new ballots */
  if (writeInLayout === undefined) {
    throw new Error('unexpected write-in option index');
  }

  debug('created write-in image view');
  return {
    writeInId,
    cvrId,
    imageUrl: toDataUrl(await loadImageData(image), 'image/jpeg'),
    ballotCoordinates: {
      ...layout.pageSize,
      x: 0,
      y: 0,
    },
    contestCoordinates: contestLayout.bounds,
    writeInCoordinates: writeInLayout.bounds,
  };
}

/**
 * Retrieves and compiles the data necessary to adjudicate a write-in (image,
 * layout, disallowed votes)
 */
export function getWriteInAdjudicationContext({
  store,
  writeInId,
}: {
  store: Store;
  writeInId: Id;
}): WriteInAdjudicationContext {
  debug('creating write-in adjudication context for %s...', writeInId);
  debug('getting write-in record with votes...');
  const writeInContext = store.getWriteInWithVotes(writeInId);
  const { contestId, optionId, cvrVotes, cvrId } = writeInContext;
  const electionId = assertDefined(store.getCurrentElectionId());

  debug('getting all write-in records for the current cvr and contest...');
  const allWriteInRecords = store.getWriteInRecords({
    electionId,
    contestId,
    castVoteRecordId: cvrId,
  });

  const primaryWriteIn = find(
    allWriteInRecords,
    (writeInRecord) => writeInRecord.optionId === optionId
  );

  const relatedWriteIns = allWriteInRecords.filter(
    (writeInRecord) => writeInRecord.optionId !== optionId
  );

  debug('created write-in adjudication context');
  return {
    writeIn: primaryWriteIn,
    relatedWriteIns,
    cvrId,
    cvrVotes,
  };
}
