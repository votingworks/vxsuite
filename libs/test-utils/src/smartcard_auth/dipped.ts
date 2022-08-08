import {
  ElectionManagerUser,
  CardProgramming,
  CardStorage,
  DippedSmartcardAuth,
} from '@votingworks/types';
import {
  fakeSystemAdministratorUser,
  fakeCardStorage,
  fakeElectionManagerUser,
  fakeCardProgramming,
} from './auth';

export function fakeCheckingPasscodeAuth(
  props: Partial<DippedSmartcardAuth.CheckingPasscode> = {}
): DippedSmartcardAuth.CheckingPasscode {
  return {
    status: 'checking_passcode',
    user: fakeElectionManagerUser(),
    checkPasscode: jest.fn(),
    ...props,
  };
}

export function fakeSystemAdministratorAuth(
  card: Partial<CardStorage & CardProgramming> = {}
): DippedSmartcardAuth.SystemAdministratorLoggedIn {
  return {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    card: {
      ...fakeCardStorage(card),
      ...fakeCardProgramming(card),
    },
    logOut: jest.fn(),
  };
}

export function fakeElectionManagerAuth(
  user: Partial<ElectionManagerUser> = {},
  card: Partial<CardStorage> = {}
): DippedSmartcardAuth.ElectionManagerLoggedIn {
  return {
    status: 'logged_in',
    user: fakeElectionManagerUser(user),
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
    bootstrapAuthenticatedElectionManagerSession: jest.fn(),
    ...props,
  };
}
