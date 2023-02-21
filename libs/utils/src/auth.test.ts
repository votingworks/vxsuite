import {
  fakeCardlessVoterUser,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeSystemAdministratorUser,
} from '@votingworks/test-utils';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import {
  isCardlessVoterAuth,
  isElectionManagerAuth,
  isPollWorkerAuth,
  isSystemAdministratorAuth,
} from './auth';

const systemAdministratorAuthStatus: {
  dipped: DippedSmartCardAuth.SystemAdministratorLoggedIn;
  inserted: InsertedSmartCardAuth.SystemAdministratorLoggedIn;
} = {
  dipped: {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: { status: 'no_card' },
  },
  inserted: {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
  },
};

const electionManagerAuthStatus: {
  dipped: DippedSmartCardAuth.ElectionManagerLoggedIn;
  inserted: InsertedSmartCardAuth.ElectionManagerLoggedIn;
} = {
  dipped: {
    status: 'logged_in',
    user: fakeElectionManagerUser(),
  },
  inserted: {
    status: 'logged_in',
    user: fakeElectionManagerUser(),
  },
};

const pollWorkerAuthStatus: {
  basic: InsertedSmartCardAuth.PollWorkerLoggedIn;
  withCardlessVoter: InsertedSmartCardAuth.PollWorkerLoggedIn;
} = {
  basic: {
    status: 'logged_in',
    user: fakePollWorkerUser(),
  },
  withCardlessVoter: {
    status: 'logged_in',
    user: fakePollWorkerUser(),
    cardlessVoterUser: fakeCardlessVoterUser(),
  },
};

const cardlessVoterAuthStatus: {
  basic: InsertedSmartCardAuth.CardlessVoterLoggedIn;
} = {
  basic: {
    status: 'logged_in',
    user: fakeCardlessVoterUser(),
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
  dippedSysAdmin: DippedSmartCardAuth.CheckingPin;
  insertedSysAdmin: InsertedSmartCardAuth.CheckingPin;
  dippedElectionManager: DippedSmartCardAuth.CheckingPin;
  insertedElectionManager: InsertedSmartCardAuth.CheckingPin;
} = {
  dippedSysAdmin: {
    status: 'checking_passcode',
    user: fakeSystemAdministratorUser(),
  },
  insertedSysAdmin: {
    status: 'checking_passcode',
    user: fakeSystemAdministratorUser(),
  },
  dippedElectionManager: {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(),
  },
  insertedElectionManager: {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(),
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
