import { expect, test } from 'vitest';
import {
  mockCardlessVoterUser,
  mockElectionManagerUser,
  mockPollWorkerUser,
  mockSessionExpiresAt,
  mockSystemAdministratorUser,
  mockVendorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import {
  isCardlessVoterAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
  isVendorAuth,
} from './auth';

const vendorAuthStatus: {
  dipped: DippedSmartCardAuth.VendorLoggedIn;
  inserted: InsertedSmartCardAuth.VendorLoggedIn;
} = {
  dipped: {
    status: 'logged_in',
    user: mockVendorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
  inserted: {
    status: 'logged_in',
    user: mockVendorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
};

const systemAdministratorAuthStatus: {
  dipped: DippedSmartCardAuth.SystemAdministratorLoggedIn;
  inserted: InsertedSmartCardAuth.SystemAdministratorLoggedIn;
} = {
  dipped: {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    programmableCard: { status: 'no_card' },
  },
  inserted: {
    status: 'logged_in',
    user: mockSystemAdministratorUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
};

const electionManagerAuthStatus: {
  dipped: DippedSmartCardAuth.ElectionManagerLoggedIn;
  inserted: InsertedSmartCardAuth.ElectionManagerLoggedIn;
} = {
  dipped: {
    status: 'logged_in',
    user: mockElectionManagerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
  inserted: {
    status: 'logged_in',
    user: mockElectionManagerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
};

const pollWorkerAuthStatus: {
  basic: InsertedSmartCardAuth.PollWorkerLoggedIn;
  withCardlessVoter: InsertedSmartCardAuth.PollWorkerLoggedIn;
} = {
  basic: {
    status: 'logged_in',
    user: mockPollWorkerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
  withCardlessVoter: {
    status: 'logged_in',
    user: mockPollWorkerUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
    cardlessVoterUser: mockCardlessVoterUser(),
  },
};

const cardlessVoterAuthStatus: {
  basic: InsertedSmartCardAuth.CardlessVoterLoggedIn;
} = {
  basic: {
    status: 'logged_in',
    user: mockCardlessVoterUser(),
    sessionExpiresAt: mockSessionExpiresAt(),
  },
};

const loggedOutAuthStatus: {
  dipped: DippedSmartCardAuth.LoggedOut;
  inserted: InsertedSmartCardAuth.LoggedOut;
} = {
  dipped: {
    status: 'logged_out',
    reason: 'machine_locked',
  },
  inserted: {
    status: 'logged_out',
    reason: 'no_card',
  },
};

const checkingPinAuthStatus: {
  dippedVendor: DippedSmartCardAuth.CheckingPin;
  insertedVendor: InsertedSmartCardAuth.CheckingPin;
  dippedSysAdmin: DippedSmartCardAuth.CheckingPin;
  insertedSysAdmin: InsertedSmartCardAuth.CheckingPin;
  dippedElectionManager: DippedSmartCardAuth.CheckingPin;
  insertedElectionManager: InsertedSmartCardAuth.CheckingPin;
} = {
  dippedVendor: {
    status: 'checking_pin',
    user: mockVendorUser(),
  },
  insertedVendor: {
    status: 'checking_pin',
    user: mockVendorUser(),
  },
  dippedSysAdmin: {
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  },
  insertedSysAdmin: {
    status: 'checking_pin',
    user: mockSystemAdministratorUser(),
  },
  dippedElectionManager: {
    status: 'checking_pin',
    user: mockElectionManagerUser(),
  },
  insertedElectionManager: {
    status: 'checking_pin',
    user: mockElectionManagerUser(),
  },
};

interface DippedTestCase {
  authStatus: DippedSmartCardAuth.AuthStatus;
  result: boolean;
}

interface InsertedTestCase {
  authStatus: InsertedSmartCardAuth.AuthStatus;
  result: boolean;
}

test.each([
  { authStatus: vendorAuthStatus.dipped, result: true },
  { authStatus: systemAdministratorAuthStatus.dipped, result: false },
  { authStatus: electionManagerAuthStatus.dipped, result: false },
  { authStatus: loggedOutAuthStatus.dipped, result: false },
  { authStatus: checkingPinAuthStatus.dippedVendor, result: false },
])(
  'isVendorAuth with dipped smart card auth statuses',
  ({ authStatus, result }: DippedTestCase) => {
    expect(isVendorAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: vendorAuthStatus.inserted, result: true },
  { authStatus: systemAdministratorAuthStatus.inserted, result: false },
  { authStatus: electionManagerAuthStatus.inserted, result: false },
  { authStatus: loggedOutAuthStatus.inserted, result: false },
  { authStatus: checkingPinAuthStatus.insertedVendor, result: false },
])(
  'isVendorAuth with inserted smart card auth statuses',
  ({ authStatus, result }: InsertedTestCase) => {
    expect(isVendorAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: vendorAuthStatus.dipped, result: false },
  { authStatus: systemAdministratorAuthStatus.dipped, result: true },
  { authStatus: electionManagerAuthStatus.dipped, result: false },
  { authStatus: loggedOutAuthStatus.dipped, result: false },
  { authStatus: checkingPinAuthStatus.dippedSysAdmin, result: false },
])(
  'isSystemAdministratorAuth with dipped smart card auth statuses',
  ({ authStatus, result }: DippedTestCase) => {
    expect(isSystemAdministratorAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: vendorAuthStatus.inserted, result: false },
  { authStatus: systemAdministratorAuthStatus.inserted, result: true },
  { authStatus: electionManagerAuthStatus.inserted, result: false },
  { authStatus: loggedOutAuthStatus.inserted, result: false },
  { authStatus: checkingPinAuthStatus.insertedSysAdmin, result: false },
])(
  'isSystemAdministratorAuth with inserted smart card auth statuses',
  ({ authStatus, result }: InsertedTestCase) => {
    expect(isSystemAdministratorAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: vendorAuthStatus.dipped, result: false },
  { authStatus: systemAdministratorAuthStatus.dipped, result: false },
  { authStatus: electionManagerAuthStatus.dipped, result: true },
  { authStatus: loggedOutAuthStatus.dipped, result: false },
  { authStatus: checkingPinAuthStatus.dippedElectionManager, result: false },
])(
  'isElectionManagerAuth with dipped smart card auth statuses',
  ({ authStatus, result }: DippedTestCase) => {
    expect(isElectionManagerAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: vendorAuthStatus.inserted, result: false },
  { authStatus: systemAdministratorAuthStatus.inserted, result: false },
  { authStatus: electionManagerAuthStatus.inserted, result: true },
  { authStatus: loggedOutAuthStatus.inserted, result: false },
  { authStatus: checkingPinAuthStatus.insertedElectionManager, result: false },
])(
  'isElectionManagerAuth with inserted smart card auth statuses',
  ({ authStatus, result }: InsertedTestCase) => {
    expect(isElectionManagerAuth(authStatus)).toEqual(result);
  }
);

test.each([
  { authStatus: pollWorkerAuthStatus.basic, result: true },
  { authStatus: pollWorkerAuthStatus.withCardlessVoter, result: true },
  { authStatus: cardlessVoterAuthStatus.basic, result: false },
  { authStatus: loggedOutAuthStatus.inserted, result: false },
])('isPollWorkerAuth', ({ authStatus, result }: InsertedTestCase) => {
  expect(isPollWorkerAuth(authStatus)).toEqual(result);
});

test.each([
  { authStatus: pollWorkerAuthStatus.basic, result: false },
  { authStatus: pollWorkerAuthStatus.withCardlessVoter, result: false },
  { authStatus: cardlessVoterAuthStatus.basic, result: true },
  { authStatus: loggedOutAuthStatus.inserted, result: false },
])('isCardlessVoterAuth', ({ authStatus, result }: InsertedTestCase) => {
  expect(isCardlessVoterAuth(authStatus)).toEqual(result);
});
