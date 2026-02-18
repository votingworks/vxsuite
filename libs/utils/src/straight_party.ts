import {
  CandidateContest,
  ContestOptionId,
  Election,
  PartyId,
  Tabulation,
} from '@votingworks/types';

/**
 * Applies straight party expansion rules to raw votes.
 *
 * For each partisan candidate contest with undervotes, if the voter selected a
 * party in the straight party contest, fills remaining seats with that party's
 * candidates (only if the expansion is deterministic — i.e. the number of
 * unselected party candidates fits in the remaining seats).
 *
 * Returns the original votes if there is no straight party contest, no valid
 * selection, or the straight party vote is overvoted.
 */
export function applyStraightPartyRules(
  election: Election,
  votes: Tabulation.Votes
): Tabulation.Votes {
  const straightPartyContest = election.contests.find(
    (c) => c.type === 'straight-party'
  );
  if (!straightPartyContest) return votes;

  const straightPartyVote = votes[straightPartyContest.id];

  // No selection or overvoted (more than one party selected)
  if (!straightPartyVote || straightPartyVote.length !== 1) return votes;

  const selectedPartyId = straightPartyVote[0] as PartyId;

  const expandedVotes: Tabulation.Votes = { ...votes };

  for (const contest of election.contests) {
    if (contest.type !== 'candidate') continue;
    if (!isPartisanContest(contest, selectedPartyId)) continue;

    const voterSelections = votes[contest.id] ?? [];

    // Voter already filled all seats
    if (voterSelections.length >= contest.seats) continue;

    const partyOptionIds = contest.candidates
      .filter((c) => c.partyIds?.includes(selectedPartyId))
      .map((c) => c.id);

    const selectedSet = new Set<ContestOptionId>(voterSelections);
    const unselectedPartyOptions = partyOptionIds.filter(
      (id) => !selectedSet.has(id)
    );

    const remainingSeats = contest.seats - voterSelections.length;

    // Only expand if deterministic — all unselected party candidates fit
    if (unselectedPartyOptions.length <= remainingSeats) {
      expandedVotes[contest.id] = [
        ...voterSelections,
        ...unselectedPartyOptions,
      ];
    }
  }

  return expandedVotes;
}

function isPartisanContest(
  contest: CandidateContest,
  partyId: PartyId
): boolean {
  return contest.candidates.some((c) => c.partyIds?.includes(partyId));
}
