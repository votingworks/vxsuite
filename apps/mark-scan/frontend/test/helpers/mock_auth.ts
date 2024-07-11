import {
  mockCardlessVoterUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import {
  electionAuthKey,
  ElectionDefinition,
  InsertedSmartCardAuth,
} from '@votingworks/types';

export function mockPollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: mockPollWorkerUser({
      electionKey: electionAuthKey(electionDefinition.election),
    }),
    sessionExpiresAt: mockSessionExpiresAt(),
  };
}

export function mockCardlessVoterAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;

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
  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;

  return {
    ...mockPollWorkerAuth(electionDefinition),
    user: mockCardlessVoterUser({
      ballotStyleId,
      precinctId,
    }),
  };
}
