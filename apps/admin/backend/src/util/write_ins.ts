import { assertDefined } from '@votingworks/basics';
import { CandidateId, Id, safeParseNumber } from '@votingworks/types';
import { loadImageData, toDataUrl } from '@votingworks/image-utils';
import { Store } from '../store';
import {
  WriteInDetailView,
  WriteInRecordAdjudicatedOfficialCandidate,
  WriteInRecordAdjudicatedWriteInCandidate,
} from '../types';

/**
 * Retrieves and compiles the data necessary to adjudicate a write-in (image,
 * layout, disallowed votes)
 */
export async function getWriteInDetailView({
  store,
  writeInId,
}: {
  store: Store;
  writeInId: Id;
}): Promise<WriteInDetailView> {
  const writeInDetails = store.getWriteInWithDetails(writeInId);
  const {
    contestId,
    optionId,
    layout,
    image,
    castVoteRecordVotes,
    castVoteRecordId,
  } = writeInDetails;
  const electionId = assertDefined(store.getCurrentElectionId());

  // get valid adjudicated write-ins from same ballot, same contest, different options
  const otherWriteIns = store
    .getWriteInRecords({
      electionId,
      contestId,
      castVoteRecordId,
    })
    .filter(
      (
        writeInRecord
      ): writeInRecord is
        | WriteInRecordAdjudicatedOfficialCandidate
        | WriteInRecordAdjudicatedWriteInCandidate =>
        writeInRecord.optionId !== writeInDetails.optionId &&
        writeInRecord.status === 'adjudicated' &&
        (writeInRecord.adjudicationType === 'official-candidate' ||
          writeInRecord.adjudicationType === 'write-in-candidate')
    );

  // calculate illegal adjudications for current write-in based on the other
  // marked or adjudicated candidates
  const markedOfficialCandidateIds = (
    (castVoteRecordVotes[contestId] as CandidateId[]) ?? []
  ).filter((candidateId) => !candidateId.startsWith('write-in-'));

  const writeInAdjudicatedOfficialCandidateIds: CandidateId[] = [];
  const writeInAdjudicatedWriteInCandidateIds: string[] = [];

  for (const otherWriteIn of otherWriteIns) {
    if (otherWriteIn.adjudicationType === 'official-candidate') {
      writeInAdjudicatedOfficialCandidateIds.push(otherWriteIn.candidateId);
    } else if (otherWriteIn.adjudicationType === 'write-in-candidate') {
      writeInAdjudicatedWriteInCandidateIds.push(otherWriteIn.candidateId);
    }
  }

  // identify the contest layout
  const contestLayout = layout.contests.find(
    (contest) => contest.contestId === contestId
  );
  if (!contestLayout) {
    throw new Error('unable to find a layout for the specified contest');
  }

  // identify the write-in option layout
  const writeInOptions = contestLayout.options.filter((option) =>
    option.definition?.id.startsWith('write-in')
  );
  const writeInOptionIndex = safeParseNumber(
    optionId.slice('write-in-'.length)
  );
  if (writeInOptionIndex.isErr() || writeInOptions === undefined) {
    throw new Error('unable to interpret layout write-in options');
  }
  const writeInLayout = writeInOptions[writeInOptionIndex.ok()];
  if (writeInLayout === undefined) {
    throw new Error('unexpected write-in option index');
  }

  return {
    imageUrl: toDataUrl(await loadImageData(image), 'image/jpeg'),
    ballotCoordinates: {
      ...layout.pageSize,
      x: 0,
      y: 0,
    },
    contestCoordinates: contestLayout.bounds,
    writeInCoordinates: writeInLayout.bounds,
    markedOfficialCandidateIds,
    writeInAdjudicatedOfficialCandidateIds,
    writeInAdjudicatedWriteInCandidateIds,
  };
}
