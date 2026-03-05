import {
  CandidateContest,
  CandidateId,
  CandidateVote,
  Election,
  Optional,
  PartyId,
  VotesDict,
} from '@votingworks/types';

export function getStraightPartySelectedPartyId(
  election: Election,
  votes: VotesDict
): Optional<PartyId> {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return undefined;

  const straightPartyVote = votes[straightPartyContest.id];
  if (!straightPartyVote || straightPartyVote.length !== 1) return undefined;

  return straightPartyVote[0] as PartyId;
}

/**
 * Derives the set of candidate IDs that are indirectly selected by a
 * straight-party vote for a given candidate contest.
 *
 * Mirrors the deterministic-expansion logic from `applyStraightPartyRules` in
 * `libs/utils/src/straight_party.ts`, but operates on VxMark's `Candidate[]`
 * vote format instead of `ContestOptionId[]`.
 */
export function getIndirectCandidateIds(
  election: Election,
  votes: VotesDict,
  contest: CandidateContest
): Set<CandidateId> {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return new Set();

  const straightPartyVote = votes[straightPartyContest.id];
  if (!straightPartyVote || straightPartyVote.length !== 1) return new Set();

  const selectedPartyId = straightPartyVote[0] as PartyId;

  const directVote = (votes[contest.id] ?? []) as CandidateVote;

  if (directVote.length >= contest.seats) return new Set();

  const partyCandidateIds = contest.candidates
    .filter((c) => c.partyIds?.includes(selectedPartyId))
    .map((c) => c.id);

  const directCandidateIds = new Set(directVote.map((c) => c.id));
  const unselectedPartyCandidateIds = partyCandidateIds.filter(
    (id) => !directCandidateIds.has(id)
  );

  const remainingSeats = contest.seats - directVote.length;

  // Only expand if deterministic — all unselected party candidates fit
  if (unselectedPartyCandidateIds.length > remainingSeats) return new Set();

  return new Set(unselectedPartyCandidateIds);
}
