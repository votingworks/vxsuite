import {
  CardStorage,
  InsertedSmartcardAuth,
  AdminUser,
  PollworkerUser,
  VoterUser,
  CardlessVoterUser,
} from '@votingworks/types';
import {
  fakeSuperadminUser,
  fakeCardStorage,
  fakeAdminUser,
  fakePollworkerUser,
  fakeVoterUser,
  fakeCardlessVoterUser,
} from './auth';

export function fakeCheckingPasscodeAuth(
  props: Partial<InsertedSmartcardAuth.CheckingPasscode> = {}
): InsertedSmartcardAuth.CheckingPasscode {
  return {
    status: 'checking_passcode',
    user: fakeAdminUser(),
    checkPasscode: jest.fn(),
    ...props,
  };
}

export function fakeSuperadminAuth(
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.SuperadminLoggedIn {
  return {
    status: 'logged_in',
    user: fakeSuperadminUser(),
    card: fakeCardStorage(card),
  };
}

export function fakeAdminAuth(
  user: Partial<AdminUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.AdminLoggedIn {
  return {
    status: 'logged_in',
    user: fakeAdminUser(user),
    card: fakeCardStorage(card),
  };
}

export function fakePollworkerAuth(
  user: Partial<PollworkerUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.PollworkerLoggedIn {
  return {
    status: 'logged_in',
    user: fakePollworkerUser(user),
    card: fakeCardStorage(card),
    activateCardlessVoter: jest.fn(),
    deactivateCardlessVoter: jest.fn(),
  };
}

export function fakeVoterAuth(
  user: Partial<VoterUser> = {},
  card: Partial<CardStorage> = {}
): InsertedSmartcardAuth.VoterLoggedIn {
  return {
    status: 'logged_in',
    user: fakeVoterUser(user),
    card: fakeCardStorage(card),
    markCardVoided: jest.fn(),
    markCardPrinted: jest.fn(),
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
