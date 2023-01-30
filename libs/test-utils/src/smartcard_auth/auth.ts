import {
  CardStorage,
  CardProgramming,
  SystemAdministratorUser,
  ElectionManagerUser,
  PollWorkerUser,
  VoterUser,
  CardlessVoterUser,
} from '@votingworks/types';
import { ok } from '@votingworks/basics';

export function fakeCardStorage(props: Partial<CardStorage> = {}): CardStorage {
  return {
    hasStoredData: false,
    /* eslint-disable @typescript-eslint/ban-ts-comment */
    // @ts-ignore
    readStoredObject: jest.fn(() => Promise.resolve(ok())),
    // @ts-ignore
    readStoredString: jest.fn(() => Promise.resolve(ok())),
    // @ts-ignore
    readStoredUint8Array: jest.fn(() => Promise.resolve(ok())),
    // @ts-ignore
    writeStoredData: jest.fn(() => Promise.resolve(ok())),
    // @ts-ignore
    clearStoredData: jest.fn(() => Promise.resolve(ok())),
    ...props,
    /* eslint-enable @typescript-eslint/ban-ts-comment */
  };
}

export function fakeCardProgramming(
  props: Partial<CardProgramming> = {}
): CardProgramming {
  return {
    programmedUser: undefined,
    programUser: jest.fn(() => Promise.resolve(ok())),
    unprogramUser: jest.fn(() => Promise.resolve(ok())),
    ...props,
  };
}

export function fakeSystemAdministratorUser(
  props: Partial<SystemAdministratorUser> = {}
): SystemAdministratorUser {
  return {
    role: 'system_administrator',
    passcode: '123456',
    ...props,
  };
}

export function fakeElectionManagerUser(
  props: Partial<ElectionManagerUser> = {}
): ElectionManagerUser {
  return {
    role: 'election_manager',
    electionHash: 'election-hash',
    passcode: '123456',
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
