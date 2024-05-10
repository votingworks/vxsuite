import { DateTime } from 'luxon';
import {
  CardlessVoterUser,
  DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  TEST_JURISDICTION,
  VendorUser,
} from '@votingworks/types';

export function mockVendorUser(props: Partial<VendorUser> = {}): VendorUser {
  return {
    role: 'vendor',
    jurisdiction: TEST_JURISDICTION,
    ...props,
  };
}

export function mockSystemAdministratorUser(
  props: Partial<SystemAdministratorUser> = {}
): SystemAdministratorUser {
  return {
    role: 'system_administrator',
    jurisdiction: TEST_JURISDICTION,
    ...props,
  };
}

export function mockElectionManagerUser(
  props: Partial<ElectionManagerUser> = {}
): ElectionManagerUser {
  return {
    role: 'election_manager',
    jurisdiction: TEST_JURISDICTION,
    electionHash: 'election-hash',
    ...props,
  };
}

export function mockPollWorkerUser(
  props: Partial<PollWorkerUser> = {}
): PollWorkerUser {
  return {
    role: 'poll_worker',
    jurisdiction: TEST_JURISDICTION,
    electionHash: 'election-hash',
    ...props,
  };
}

export function mockCardlessVoterUser(
  props: Partial<CardlessVoterUser> = {}
): CardlessVoterUser {
  return {
    role: 'cardless_voter',
    ballotStyleId: 'ballot-style-id',
    precinctId: 'precinct-id',
    ...props,
  };
}

export function mockSessionExpiresAt(): Date {
  return DateTime.now()
    .plus({ hours: DEFAULT_OVERALL_SESSION_TIME_LIMIT_HOURS })
    .toJSDate();
}
