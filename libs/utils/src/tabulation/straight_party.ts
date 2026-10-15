import {
  type BallotStyle,
  type Candidate,
  type CandidateContest,
  type CandidateVote,
  type Contest,
  type ContestOptionId,
  type Election,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  type PartyId,
  type StraightPartyVote,
  type Tabulation,
  type VotesDict,
} from '@votingworks/types';
import {
  assert,
  assertDefined,
  find,
  mapObject,
  type Optional,
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

/**
 * Returns the candidate options with derived votes from a straight party
 * selection. This matters for cross-endorsed candidates, which have multiple
 * candidate options - one per endorsing party - so we need the candidate option
 * that matches the selected party.
 */
export function deriveStraightPartyVotesFromOrderedCandidates({
  contest,
  vote,
  ballotStyle,
  selectedStraightPartyId: straightPartyId,
}: {
  contest: CandidateContest;
  vote: CandidateVote;
  ballotStyle: BallotStyle;
  selectedStraightPartyId?: PartyId;
}): Candidate[] {
  const derivedVotes = deriveStraightPartyVotesForContest(
    contest,
    vote.map((candidate) => candidate.id),
    straightPartyId
  );
  const orderedCandidates = getOrderedCandidatesForContestInBallotStyle({
    contest,
    ballotStyle,
  });
  return derivedVotes.map((candidateId) =>
    find(
      orderedCandidates,
      (candidate) =>
        candidate.id === candidateId &&
        Boolean(candidate.partyIds?.includes(assertDefined(straightPartyId)))
    )
  );
}

/**
 * Adds the candidate votes implied by a straight party selection as explicit
 * votes, e.g. for printing them on a BMD ballot.
 */
export function addDerivedStraightPartyVotes({
  election,
  ballotStyle,
  votes,
}: {
  election: Election;
  ballotStyle: BallotStyle;
  votes: VotesDict;
}): VotesDict {
  const straightPartyId = selectedStraightPartyId(election, votes);
  if (!straightPartyId) return votes;

  const votesWithDerivedVotes: VotesDict = { ...votes };
  for (const contest of getContests({ election, ballotStyle })) {
    if (contest.type !== 'candidate') continue;
    const vote = (votes[contest.id] ?? []) as CandidateVote;
    const derivedVotes = deriveStraightPartyVotesFromOrderedCandidates({
      contest,
      vote,
      ballotStyle,
      selectedStraightPartyId: straightPartyId,
    });
    if (derivedVotes.length > 0) {
      votesWithDerivedVotes[contest.id] = [...vote, ...derivedVotes];
    }
  }
  return votesWithDerivedVotes;
}
