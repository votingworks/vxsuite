import {
  CardStorage,
  SuperadminUser,
  AdminUser,
  PollworkerUser,
  VoterUser,
  CardlessVoterUser,
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
    passcode: '123456',
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
