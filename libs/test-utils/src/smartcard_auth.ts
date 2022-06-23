import {
  CardStorage,
  SuperadminUser,
  AdminUser,
  PollworkerUser,
  VoterUser,
  SuperadminLoggedInAuth,
  AdminLoggedInAuth,
  PollworkerLoggedInAuth,
  VoterLoggedInAuth,
  LoggedOutAuth,
} from '@votingworks/types';

export function fakeCardStorage(props: Partial<CardStorage> = {}): CardStorage {
  return {
    hasStoredData: false,
    readStoredObject: jest.fn(),
    readStoredString: jest.fn(),
    readStoredUint8Array: jest.fn(),
    writeStoredData: jest.fn(),
    clearStoredData: jest.fn(),
    ...props,
  };
}

export function fakeSuperadminUser(): SuperadminUser {
  return {
    role: 'superadmin',
  };
}

export function fakeAdminUser(props: Partial<AdminUser> = {}): AdminUser {
  return {
    role: 'admin',
    electionHash: 'election-hash',
    ...props,
  };
}

export function fakePollworkerUser(
  props: Partial<PollworkerUser> = {}
): PollworkerUser {
  return {
    role: 'pollworker',
    electionHash: 'election-hash',
    ...props,
  };
}

export function fakeVoterUser(props: Partial<VoterUser> = {}): VoterUser {
  return {
    role: 'voter',
    createdAt: 1,
    ballotStyleId: 'fake-ballot-style-id',
    precinctId: 'fake-precinct-id',
    ...props,
  };
}

export function fakeSuperadminAuth(
  card: Partial<CardStorage> = {}
): SuperadminLoggedInAuth {
  return {
    status: 'logged_in',
    user: fakeSuperadminUser(),
    card: fakeCardStorage(card),
  };
}

export function fakeAdminAuth(
  user: Partial<AdminUser> = {},
  card: Partial<CardStorage> = {}
): AdminLoggedInAuth {
  return {
    status: 'logged_in',
    user: fakeAdminUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakePollworkerAuth(
  user: Partial<PollworkerUser> = {},
  card: Partial<CardStorage> = {}
): PollworkerLoggedInAuth {
  return {
    status: 'logged_in',
    user: fakePollworkerUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakeVoterAuth(
  user: Partial<VoterUser> = {},
  card: Partial<CardStorage> = {}
): VoterLoggedInAuth {
  return {
    status: 'logged_in',
    user: fakeVoterUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakeLoggedOutAuth(
  props: Partial<LoggedOutAuth> = {}
): LoggedOutAuth {
  return {
    status: 'logged_out',
    reason: 'no_card',
    ...props,
  };
}
