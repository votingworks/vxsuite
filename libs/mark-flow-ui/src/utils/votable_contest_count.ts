import { assert, groupBy } from '@votingworks/basics';
import {
  BallotStyle,
  CandidateContest,
  Election,
  getContests,
  isOpenPrimary,
} from '@votingworks/types';
import { mergeMsEitherNeitherContests } from './ms_either_neither_contests';

/**
 * Computes the number of contests a voter can actually vote in for a given
 * ballot style, for display on the start page.
 *
 * For open primaries, every party's partisan contests share the same ballot
 * style, but a voter only votes in a single party's contests. The votable count
 * is therefore the number of nonpartisan contests plus the number of partisan
 * contests for a single party. Every party must have the same number of
 * partisan contests; we assert this and fail otherwise. For all other elections
 * every contest on the ballot style is votable, so we use the count directly.
 */
export function getVotableContestCount({
  election,
  ballotStyle,
}: {
  election: Election;
  ballotStyle: BallotStyle;
}): number {
  const contests = mergeMsEitherNeitherContests(
    getContests({ election, ballotStyle })
  );

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
