import { Election, Tabulation } from '@votingworks/types';
import { assert, assertDefined, mapObject } from '@votingworks/basics';

export function deriveStraightPartyVotes(
  election: Election,
  votes: Tabulation.Votes
): Tabulation.Votes {
  const straightPartyContest = election.contests.find(
    (contest) => contest.type === 'straight-party'
  );
  if (!straightPartyContest) {
    return votes;
  }
  assert(election.type === 'general');

  const straightPartyVotes = assertDefined(votes[straightPartyContest.id]);
  if (straightPartyVotes.length !== 1) {
    return votes;
  }
  const selectedStraightPartyId = assertDefined(straightPartyVotes[0]);

  const contestsById = Object.fromEntries(
    election.contests.map((contest) => [contest.id, contest])
  );

  return mapObject(votes, (optionIds, contestId) => {
    const contest = assertDefined(contestsById[contestId]);
    if (contest.type !== 'candidate') return optionIds;
    const remainingSeats = contest.seats - optionIds.length;
    const unselectedStraightPartyCandidateIds = contest.candidates
      .filter(
        (candidate) =>
          candidate.partyIds?.includes(selectedStraightPartyId) &&
          !optionIds.includes(candidate.id)
      )
      .map((candidate) => candidate.id);
    if (remainingSeats >= unselectedStraightPartyCandidateIds.length) {
      return [...optionIds, ...unselectedStraightPartyCandidateIds];
    }
    return optionIds;
  });
}
