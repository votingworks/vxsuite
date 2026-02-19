import {
  District,
  DistrictId,
  Election,
  StraightPartyContest,
} from '@votingworks/types';

const STRAIGHT_PARTY_CONTEST_ID = 'straight-party-ticket';
export const ELECTION_WIDE_DISTRICT_ID: DistrictId = 'election-wide';
const ELECTION_WIDE_DISTRICT_NAME = 'Election-wide';

/**
 * Injects a straight party contest into a general election if applicable.
 *
 * Conditions (state feature flag must be checked externally):
 * - Election is a general election
 * - Election has parties defined
 * - At least one candidate contest has candidates with partyIds
 *
 * If conditions are met:
 * - Creates a synthetic "election-wide" district
 * - Adds that district to all ballot styles
 * - Prepends a StraightPartyContest (with the synthetic districtId) to contests
 *
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

  const electionWideDistrict: District = {
    id: ELECTION_WIDE_DISTRICT_ID,
    name: ELECTION_WIDE_DISTRICT_NAME,
  };

  const straightPartyContest: StraightPartyContest = {
    id: STRAIGHT_PARTY_CONTEST_ID,
    type: 'straight-party',
    title: 'Straight Party',
    districtId: ELECTION_WIDE_DISTRICT_ID,
  };

  return {
    ...election,
    districts: [...election.districts, electionWideDistrict],
    ballotStyles: election.ballotStyles.map((bs) => ({
      ...bs,
      districts: [...bs.districts, ELECTION_WIDE_DISTRICT_ID],
    })),
    contests: [straightPartyContest, ...election.contests],
  };
}
