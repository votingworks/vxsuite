import { ContestId, ContestOptionId, Election } from '@votingworks/types';

/**
 * Options for a contest mapped to their position on the ballot.
 */
export type ContestOptionPositionMap = Record<ContestOptionId, number>;

/**
 * All contest option maps for an eleciton.
 */
export type ElectionOptionPositionMap = Record<
  ContestId,
  ContestOptionPositionMap
>;

/**
 * Build a lookup structure for option positions on the ballot.
 */
export function buildElectionOptionPositionMap(
  election: Election
): ElectionOptionPositionMap {
  const electionMap: ElectionOptionPositionMap = {};
  for (const contest of election.contests) {
    if (contest.type === 'yesno') {
      electionMap[contest.id] = {
        [contest.yesOption.id]: 0,
        [contest.noOption.id]: 1,
      };
    } else {
      const contestMap: ContestOptionPositionMap = {};
      for (const [index, candidate] of contest.candidates.entries()) {
        contestMap[candidate.id] = index;
      }
      if (contest.allowWriteIns) {
        for (let i = 0; i < contest.seats; i += 1) {
          contestMap[`write-in-${i}`] = contest.candidates.length + i;
        }
      }
      electionMap[contest.id] = contestMap;
    }
  }
  return electionMap;
}
