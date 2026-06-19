import {
  Contest,
  ContestOptionId,
  Election,
  PartyId,
  Tabulation,
} from '@votingworks/types';
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

  const straightPartyId = selectedStraightPartyId(
    assertDefined(votes[straightPartyContest.id])
  );
  if (!straightPartyId) return votes;

  const contestsById = Object.fromEntries(
    election.contests.map((contest) => [contest.id, contest])
  );

  return mapObject(votes, (optionIds, contestId) => {
    const contest = assertDefined(contestsById[contestId]);
    const derivedVotes = deriveStraightPartyVotesForContest(
      contest,
      optionIds,
      straightPartyId
    );
    return [...optionIds, ...derivedVotes];
  });
}

export function selectedStraightPartyId(
  straightPartyContestVotes: readonly ContestOptionId[]
): PartyId | undefined {
  if (straightPartyContestVotes.length !== 1) {
    return undefined;
  }
  return assertDefined(straightPartyContestVotes[0]);
}

export function deriveStraightPartyVotesForContest(
  contest: Contest,
  votedOptionIds: readonly ContestOptionId[],
  straightPartyId?: PartyId
): ContestOptionId[] {
  if (!(contest.type === 'candidate' && straightPartyId)) {
    return [];
  }
  const remainingSeats = contest.seats - votedOptionIds.length;
  const unselectedStraightPartyCandidateIds = contest.candidates
    .filter(
      (candidate) =>
        candidate.partyIds?.includes(straightPartyId) &&
        !votedOptionIds.includes(candidate.id)
    )
    .map((candidate) => candidate.id);
  return remainingSeats >= unselectedStraightPartyCandidateIds.length
    ? unselectedStraightPartyCandidateIds
    : [];
}
