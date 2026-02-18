import { Election, StraightPartyContest } from '@votingworks/types';

const STRAIGHT_PARTY_CONTEST_ID = 'straight-party-ticket';

/**
 * Injects a straight party contest into a general election if applicable.
 *
 * Conditions (state feature flag must be checked externally):
 * - Election is a general election
 * - Election has parties defined
 * - At least one candidate contest has candidates with partyIds
 *
 * If conditions are met, prepends a StraightPartyContest to the contest list.
 * If the election already has a straight party contest, returns unchanged.
 */
export function injectStraightPartyContest(election: Election): Election {
  if (election.type !== 'general') return election;
  if (election.parties.length === 0) return election;

  // Already has a straight party contest
  if (election.contests.some((c) => c.type === 'straight-party')) {
    return election;
  }

  const hasPartisanCandidates = election.contests.some(
    (c) =>
      c.type === 'candidate' &&
      c.candidates.some((cand) => cand.partyIds && cand.partyIds.length > 0)
  );
  if (!hasPartisanCandidates) return election;

  const straightPartyContest: StraightPartyContest = {
    id: STRAIGHT_PARTY_CONTEST_ID,
    type: 'straight-party',
    title: 'Straight Party',
  };

  return {
    ...election,
    contests: [straightPartyContest, ...election.contests],
  };
}
