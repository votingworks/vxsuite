import {
  mockCardlessVoterUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  constructElectionKey,
  type ElectionDefinition,
  type InsertedSmartCardAuth,
} from '@votingworks/types';

export function mockPollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: constructElectionKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
}

export function mockCardlessVoterAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ballotStyleId = electionDefinition.election.ballotStyles[0]!.id;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const precinctId = electionDefinition.election.precincts[0]!.id;

  return {
    ...mockPollWorkerAuth(electionDefinition),
    cardlessVoterUser: mockCardlessVoterUser({
      ballotStyleId,
      precinctId,
    }),
  };
}

export function mockCardlessVoterLoggedInAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.CardlessVoterLoggedIn {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const ballotStyleId = electionDefinition.election.ballotStyles[0]!.id;
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const precinctId = electionDefinition.election.precincts[0]!.id;

  return {
    ...mockPollWorkerAuth(electionDefinition),
    user: mockCardlessVoterUser({
      ballotStyleId,
      precinctId,
    }),
  };
}
