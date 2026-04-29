import { memoizeByObject, unique } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  PartyId,
  Tabulation,
  isOpenPrimary,
} from '@votingworks/types';

type PartisanContest = CandidateContest & { partyId: PartyId };

/**
 * Returns all the partisan contests in the election, i.e. candidate contests
 * with an associated party. Memoized per `Election` for usage in tabulation.
 */
export const partisanContests = memoizeByObject(
  (election: Election): readonly PartisanContest[] =>
    election.contests.filter(
      (contest): contest is PartisanContest =>
        contest.type === 'candidate' && contest.partyId !== undefined
    )
);

/**
 * Returns the party IDs of the partisan contests a voter voted in.
 */
export function votedPartyIds(
  election: Election,
  votes: Tabulation.Votes
): PartyId[] {
  return unique(
    partisanContests(election)
      .filter((contest) => (votes[contest.id]?.length ?? 0) > 0)
      .map((contest) => contest.partyId)
  );
}

/**
 * In open primary elections only, returns true if the voter voted in partisan
 * contests for more than one party.
 */
export function hasCrossoverVote(
  election: Election,
  votes: Tabulation.Votes
): boolean {
  // Short circuit to avoid doing extra work if it's not an open primary, even
  // though crossover votes aren't possible in general elections/closed primaries.
  if (!isOpenPrimary(election)) {
    return false;
  }
  return votedPartyIds(election, votes).length > 1;
}
