import {
  type Election,
  type ElectionRegisteredVoterCounts,
  getPartyRegisteredVoterCounts,
  listRegisteredVoterCounts,
  type PartyId,
} from '@votingworks/types';
import { ballotStyleHasPrecinctOrSplit } from './ballot_styles.js';

/**
 * Whether each party breakdown has a count for exactly the parties with a
 * ballot style in its precinct or split.
 */
export function hasValidRegisteredVoterCountParties(
  election: Election,
  counts: ElectionRegisteredVoterCounts
): boolean {
  return listRegisteredVoterCounts(election.precincts, counts).every(
    ({ precinctOrSplit, count }) => {
      const byParty =
        count === undefined ? undefined : getPartyRegisteredVoterCounts(count);
      if (byParty === undefined) return true;

      const ballotStylePartyIds = new Set<PartyId>();
      for (const ballotStyle of election.ballotStyles) {
        if (
          ballotStyle.partyId !== undefined &&
          ballotStyleHasPrecinctOrSplit(ballotStyle, precinctOrSplit)
        ) {
          ballotStylePartyIds.add(ballotStyle.partyId);
        }
      }
      const countPartyIds = Object.keys(byParty);
      return (
        countPartyIds.length === ballotStylePartyIds.size &&
        countPartyIds.every((partyId) => ballotStylePartyIds.has(partyId))
      );
    }
  );
}
