import { Admin } from '@votingworks/api';
import { CandidateContest } from '@votingworks/types';
import { DippedSmartCardAuthApi } from '@votingworks/auth';

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
 * Builds a mock auth instance
 */
export function buildMockAuth(): DippedSmartCardAuthApi {
  return {
    getAuthStatus: jest.fn(),
    checkPin: jest.fn(),
    logOut: jest.fn(),
    programCard: jest.fn(),
    unprogramCard: jest.fn(),
    setElectionDefinition: jest.fn(),
    clearElectionDefinition: jest.fn(),
  };
}
