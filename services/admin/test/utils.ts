import { Admin } from '@votingworks/api';
import { CandidateContest } from '@votingworks/types';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthWithMemoryCard,
} from '@votingworks/auth';
import { MemoryCard as MockCard } from '@votingworks/utils';

/**
 * Builds the group of options for adjudicating write-ins to official candidates
 * for a given contest, useful for testing the adjudication table results.
 */
export function buildOfficialCandidatesWriteInAdjudicationOptionGroup(
  contest: CandidateContest
): Admin.WriteInAdjudicationTableOptionGroup {
  return {
    title: 'Official Candidates',
    options: contest.candidates
      .map((candidate) => ({
        adjudicatedValue: candidate.name,
        adjudicatedOptionId: candidate.id,
        enabled: true,
      }))
      .sort((a, b) => a.adjudicatedValue.localeCompare(b.adjudicatedValue)),
  };
}

/**
 * Builds an auth instance for tests
 */
export function buildTestAuth(): {
  auth: DippedSmartCardAuthApi;
  card: MockCard;
} {
  const card = new MockCard();
  const auth = new DippedSmartCardAuthWithMemoryCard({
    card,
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: false,
    },
  });
  return { auth, card };
}
