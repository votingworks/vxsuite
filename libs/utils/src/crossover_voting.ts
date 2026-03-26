import { unique } from '@votingworks/basics';
import {
  CandidateContest,
  Election,
  PartyId,
  Tabulation,
  VotesDict,
  isOpenPrimary,
} from '@votingworks/types';

export interface CrossoverVotingResult {
  readonly isCrossover: boolean;
  readonly votedPartyIds: readonly PartyId[];
}

/**
 * Detects crossover voting in an open primary election. A crossover ballot is
 * one where the voter made selections in partisan contests belonging to more
 * than one party.
 *
 * Returns the party IDs the voter voted in and whether crossover voting
 * occurred.
 */
export function detectCrossoverVoting(
  votes: VotesDict,
  election: Election
): CrossoverVotingResult {
  if (!isOpenPrimary(election)) {
    return { isCrossover: false, votedPartyIds: [] };
  }

  const votedPartyIds = unique(
    election.contests
      .filter(
        (contest): contest is CandidateContest & { partyId: PartyId } =>
          contest.type === 'candidate' &&
          contest.partyId !== undefined &&
          contest.id in votes &&
          (votes[contest.id]?.length ?? 0) > 0
      )
      .map((contest) => contest.partyId)
  );

  return {
    isCrossover: votedPartyIds.length > 1,
    votedPartyIds,
  };
}

/**
 * Variant of crossover detection that works with Tabulation.Votes
 * (Record<ContestId, ContestOptionId[]>) used during CVR import.
 */
export function detectCrossoverVotingFromTabulationVotes(
  votes: Tabulation.Votes,
  election: Election
): boolean {
  if (!isOpenPrimary(election)) return false;

  const votedPartyIds = unique(
    election.contests
      .filter(
        (contest): contest is CandidateContest & { partyId: PartyId } =>
          contest.type === 'candidate' &&
          contest.partyId !== undefined &&
          contest.id in votes &&
          (votes[contest.id]?.length ?? 0) > 0
      )
      .map((contest) => contest.partyId)
  );

  return votedPartyIds.length > 1;
}
