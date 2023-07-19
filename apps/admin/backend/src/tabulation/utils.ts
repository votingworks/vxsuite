import { BallotStyleId, Election, Tabulation } from '@votingworks/types';

/**
 * Replaces the `partyIds` filter in a {@link Tabulation.Filter} with
 * an equivalent `ballotStyleIds` filter.
 */
export function replacePartyIdFilter(
  filter: Tabulation.Filter,
  election: Election
): Omit<Tabulation.Filter, 'partyIds'> {
  if (!filter.partyIds) return filter;

  const ballotStyleIds: BallotStyleId[] = [];

  for (const ballotStyle of election.ballotStyles) {
    if (
      ballotStyle.partyId &&
      filter.partyIds.includes(ballotStyle.partyId) &&
      (!filter.ballotStyleIds || filter.ballotStyleIds.includes(ballotStyle.id))
    ) {
      ballotStyleIds.push(ballotStyle.id);
    }
  }

  return {
    ballotStyleIds,
    precinctIds: filter.precinctIds,
    votingMethods: filter.votingMethods,
    scannerIds: filter.scannerIds,
    batchIds: filter.batchIds,
  };
}

/**
 * Tests whether CVR votes are empty.
 */
export function isBlankVotes(votes: Tabulation.Votes): boolean {
  return Object.values(votes).every((selections) => selections.length === 0);
}
