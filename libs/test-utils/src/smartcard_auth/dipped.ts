import {
  AdminUser,
  CardStorage,
  DippedSmartcardAuth,
} from '@votingworks/types';
import { fakeSuperadminUser, fakeCardStorage, fakeAdminUser } from './auth';

export function fakeCheckingPasscodeAuth(
  props: Partial<DippedSmartcardAuth.CheckingPasscode> = {}
): DippedSmartcardAuth.CheckingPasscode {
  return {
    status: 'checking_passcode',
    user: fakeAdminUser(),
    checkPasscode: jest.fn(),
    ...props,
  };
}

export function fakeSuperadminAuth(
  card: Partial<CardStorage> = {}
): DippedSmartcardAuth.SuperadminLoggedIn {
  return {
    status: 'logged_in',
    user: fakeSuperadminUser(),
    card: fakeCardStorage(card),
    logOut: jest.fn(),
  };
}

export function fakeAdminAuth(
  user: Partial<AdminUser> = {},
  card: Partial<CardStorage> = {}
): DippedSmartcardAuth.AdminLoggedIn {
  return {
    status: 'logged_in',
    user: fakeAdminUser(user),
    card: fakeCardStorage(card),
    logOut: jest.fn(),
  };
}

export function fakeLoggedOutAuth(
  props: Partial<DippedSmartcardAuth.LoggedOut> = {}
): DippedSmartcardAuth.LoggedOut {
  return {
    status: 'logged_out',
    reason: 'machine_locked',
    bootstrapAuthenticatedAdminSession: jest.fn(),
    ...props,
  };
}
