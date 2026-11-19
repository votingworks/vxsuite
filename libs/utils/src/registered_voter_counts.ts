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
 * Whether each party breakdown has a count for every party with a ballot style
 * in its precinct or split, and only for parties with a ballot style in the
 * election.
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
