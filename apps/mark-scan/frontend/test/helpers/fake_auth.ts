import {
  fakeCardlessVoterUser,
  fakePollWorkerUser,
  fakeSessionExpiresAt,
} from '@votingworks/test-utils';
import { ElectionDefinition, InsertedSmartCardAuth } from '@votingworks/types';

export function fakePollWorkerAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: fakePollWorkerUser({ electionHash: electionDefinition.electionHash }),
    sessionExpiresAt: fakeSessionExpiresAt(),
  };
}

export function fakeCardlessVoterAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.PollWorkerLoggedIn {
  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;

  return {
    ...fakePollWorkerAuth(electionDefinition),
    cardlessVoterUser: fakeCardlessVoterUser({
      ballotStyleId,
      precinctId,
    }),
  };
}

export function fakeCardlessVoterLoggedInAuth(
  electionDefinition: ElectionDefinition
): InsertedSmartCardAuth.CardlessVoterLoggedIn {
  const ballotStyleId = electionDefinition.election.ballotStyles[0].id;
  const precinctId = electionDefinition.election.precincts[0].id;

  return {
    ...fakePollWorkerAuth(electionDefinition),
    user: fakeCardlessVoterUser({
      ballotStyleId,
      precinctId,
    }),
  };
}
