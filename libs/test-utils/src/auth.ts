import {
  CardlessVoterUser,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
} from '@votingworks/types';

export function fakeSystemAdministratorUser(
  props: Partial<SystemAdministratorUser> = {}
): SystemAdministratorUser {
  return {
    role: 'system_administrator',
    ...props,
  };
}

export function fakeElectionManagerUser(
  props: Partial<ElectionManagerUser> = {}
): ElectionManagerUser {
  return {
    role: 'election_manager',
    electionHash: 'election-hash',
    ...props,
  };
}

export function fakePollWorkerUser(
  props: Partial<PollWorkerUser> = {}
): PollWorkerUser {
  return {
    role: 'poll_worker',
    electionHash: 'election-hash',
    ...props,
  };
}

export function fakeCardlessVoterUser(
  props: Partial<CardlessVoterUser> = {}
): CardlessVoterUser {
  return {
    role: 'cardless_voter',
    ballotStyleId: 'fake-ballot-style-id',
    precinctId: 'fake-precinct-id',
    ...props,
  };
}

export function fakeSessionExpiresAt(): number {
  return (
    new Date().getTime() +
    DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS * 60 * 60 * 1000
  );
}
