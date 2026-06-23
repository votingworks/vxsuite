import {
  Contest,
  ContestOptionId,
  Election,
  PartyId,
  StraightPartyVote,
  Tabulation,
  VotesDict,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  mapObject,
  Optional,
} from '@votingworks/basics';

export function deriveStraightPartyVotes(
  election: Election,
  votes: Tabulation.Votes
): Tabulation.Votes {
  const straightPartyId = selectedStraightPartyId(election, votes);
  if (!straightPartyId) return votes;
  assert(election.type === 'general');

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
  election: Election,
  votes: VotesDict
): PartyId | undefined {
  const straightPartyContest = election.contests.find(
    (contest) => contest.type === 'straight-party'
  );
  if (!straightPartyContest) return undefined;
  const straightPartyContestVotes = votes[
    straightPartyContest.id
  ] as Optional<StraightPartyVote>;
  if (straightPartyContestVotes?.length !== 1) {
    return undefined;
  }
  return straightPartyContestVotes[0];
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
