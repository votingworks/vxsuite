import {
  CardStorage,
  InsertedSmartcardAuth,
  SystemAdministratorUser,
  ElectionManagerUser,
  PollWorkerUser,
  CardlessVoterUser,
} from '@votingworks/types';
import {
  fakeSystemAdministratorUser,
  fakeCardStorage,
  fakeElectionManagerUser,
  fakePollWorkerUser,
  fakeCardlessVoterUser,
} from './auth';

export function fakeCheckingPasscodeAuth(
  props: Partial<InsertedSmartcardAuth.CheckingPasscode> = {}
): InsertedSmartcardAuth.CheckingPasscode {
  return {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(),
    checkPasscode: jest.fn(),
    ...props,
  };
}

export function fakeSystemAdministratorAuth(
  user: Partial<SystemAdministratorUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.SystemAdministratorLoggedIn {
  return {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakeElectionManagerAuth(
  user: Partial<ElectionManagerUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.ElectionManagerLoggedIn {
  return {
    status: 'logged_in',
    user: fakeElectionManagerUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakePollWorkerAuth(
  user: Partial<PollWorkerUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.PollWorkerLoggedIn {
  return {
    status: 'logged_in',
    user: fakePollWorkerUser(user),
    card: fakeCardStorage(card),
    activateCardlessVoter: jest.fn(),
    deactivateCardlessVoter: jest.fn(),
  };
}

export function fakeCardlessVoterAuth(
  user: Partial<CardlessVoterUser> = {}
): InsertedSmartcardAuth.CardlessVoterLoggedIn {
  return {
    status: 'logged_in',
    user: fakeCardlessVoterUser(user),
    logOut: jest.fn(),
  };
}

export function fakeLoggedOutAuth(
  props: Partial<InsertedSmartcardAuth.LoggedOut> = {}
): InsertedSmartcardAuth.LoggedOut {
  return {
    status: 'logged_out',
    reason: 'no_card',
    ...props,
  };
}
