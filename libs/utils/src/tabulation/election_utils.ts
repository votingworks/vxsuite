import { AnyContest } from '@votingworks/types';

/**
 * Contests appear on ballots or not based on the district the contest is
 * associated with and the party. This function just covers the party part. Rules:
 *   - ballot measures can appear on ballots of any party
 *   - candidates contests with an associated party can only appear on ballots of the same party
 */
export function doesContestAppearOnPartyBallot(
  contest: AnyContest,
  ballotPartyId?: string
): boolean {
  return (
    contest.type === 'yesno' ||
    !contest.partyId ||
    contest.partyId === ballotPartyId
  );
}
