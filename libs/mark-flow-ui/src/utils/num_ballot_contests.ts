import { assert, groupBy } from '@votingworks/basics';
import { CandidateContest, Election, isOpenPrimary } from '@votingworks/types';
import { ContestsWithMsEitherNeither } from './ms_either_neither_contests';

/**
 * Computes the number of contests a voter will see on their ballot, for display
 * on the start page.
 *
 * For open primaries, the provided contest list contains the partisan contests
 * for *every* party, since the voter hasn't yet selected a party. A voter only
 * votes in a single party's contests, so the correct count is the number of
 * nonpartisan contests plus the number of partisan contests for a single party.
 * Every party must have the same number of partisan contests; we assert this
 * and fail otherwise. For all other elections the contest list already reflects
 * the voter's ballot, so we use its length directly.
 */
export function getNumBallotContests(
  election: Election,
  contests: ContestsWithMsEitherNeither
): number {
  if (!isOpenPrimary(election)) {
    return contests.length;
  }

  const partisanContests = contests.filter(
    (contest): contest is CandidateContest =>
      contest.type === 'candidate' && contest.partyId !== undefined
  );
  if (partisanContests.length === 0) {
    return contests.length;
  }

  const partisanContestCountsByParty = groupBy(
    partisanContests,
    (contest) => contest.partyId
  ).map(([, partyContests]) => partyContests.length);
  assert(
    new Set(partisanContestCountsByParty).size === 1,
    'Expected every party to have the same number of partisan contests in an open primary'
  );

  const nonpartisanContestCount = contests.length - partisanContests.length;
  return nonpartisanContestCount + partisanContestCountsByParty[0];
}
