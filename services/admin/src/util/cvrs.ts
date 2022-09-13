import { CastVoteRecord, ContestId, ContestOptionId } from '@votingworks/types';

/**
 * Gets all the write-in options from a list.
 */
export function getWriteInVotes(
  optionIds: ContestOptionId[]
): ContestOptionId[] {
  return optionIds.filter((id) => id.startsWith('write-in'));
}

/**
 * Gets all the write-in options from a CVR.
 */
export function getWriteInsFromCastVoteRecord(
  cvr: CastVoteRecord
): Map<ContestId, ContestOptionId[]> {
  const result = new Map<ContestId, ContestOptionId[]>();

  for (const [contestId, votes] of Object.entries(cvr)) {
    if (contestId.startsWith('_')) {
      continue;
    }

    if (Array.isArray(votes)) {
      result.set(contestId, getWriteInVotes(votes));
    }
  }

  return result;
}
