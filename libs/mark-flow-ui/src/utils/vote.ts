import { assertDefined, find, uniqueBy } from '@votingworks/basics';
import {
  BallotStyle,
  Candidate,
  CandidateContest,
  CandidateVote,
  getOrderedCandidatesForContestInBallotStyle,
  PartyId,
} from '@votingworks/types';
import { deriveStraightPartyVotesForContest } from '@votingworks/utils';

export function numVotesRemaining(
  contest: CandidateContest,
  vote: CandidateVote
): number {
  const uniqueVoteIds = uniqueBy([...vote], (c) => c.id);
  return contest.seats - uniqueVoteIds.length;
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
  selectedStraightPartyId,
}: {
  contest: CandidateContest;
  vote: CandidateVote;
  ballotStyle: BallotStyle;
  selectedStraightPartyId?: PartyId;
}): Candidate[] {
  const derivedVotes = deriveStraightPartyVotesForContest(
    contest,
    vote.map((candidate) => candidate.id),
    selectedStraightPartyId
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
        Boolean(
          candidate.partyIds?.includes(assertDefined(selectedStraightPartyId))
        )
    )
  );
}
