import {
  type Election,
  type ElectionRegisteredVoterCounts,
  listRegisteredVoterCounts,
  type PartyId,
} from '@votingworks/types';
import { ballotStyleHasPrecinctOrSplit } from './ballot_styles.js';

function partyIdsWithBallotStyles(
  ballotStyles: Election['ballotStyles']
): Set<PartyId> {
  return new Set(
    ballotStyles.flatMap((ballotStyle) =>
      ballotStyle.partyId === undefined ? [] : [ballotStyle.partyId]
    )
  );
}

/**
 * A party breakdown belongs to a precinct or split.
 * In a primary, each precinct or split has
 * ballot styles that are tied to a party.
 *
 * This function checks:
 * 1. If a precinct or split includes a party's ballot style,
 * that precinct's `counts` also include a registered voter count
 * for that party.
 *
 * 2. `counts` includes breakdowns only for parties that have
 * a ballot style somewhere in the election
 */
export function hasValidRegisteredVoterCountParties(
  election: Election,
  counts: ElectionRegisteredVoterCounts
): boolean {
  const electionPartyIds = partyIdsWithBallotStyles(election.ballotStyles);
  return listRegisteredVoterCounts(election.precincts, counts).every(
    ({ precinctOrSplit, count }) => {
      const byParty = count?.byParty;
      if (byParty === undefined) return true;

      const requiredPartyIds = partyIdsWithBallotStyles(
        election.ballotStyles.filter((ballotStyle) =>
          ballotStyleHasPrecinctOrSplit(ballotStyle, precinctOrSplit)
        )
      );
      return (
        [...requiredPartyIds].every(
          (partyId) => byParty[partyId] !== undefined
        ) &&
        Object.keys(byParty).every((partyId) => electionPartyIds.has(partyId))
      );
    }
  );
}
