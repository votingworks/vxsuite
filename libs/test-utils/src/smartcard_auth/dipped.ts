import {
  ElectionManagerUser,
  CardProgramming,
  CardStorage,
  DippedSmartcardAuth,
} from '@votingworks/types';
import {
  fakeSystemAdministratorUser,
  fakeElectionManagerUser,
  fakeCardProgramming,
  fakeCardStorage,
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
  programmableCard: Partial<CardStorage & CardProgramming> = {}
): DippedSmartcardAuth.SystemAdministratorLoggedIn {
  return {
    status: 'logged_in',
    user: fakeSystemAdministratorUser(),
    programmableCard: {
      status: 'ready',
      ...fakeCardProgramming(programmableCard),
      ...fakeCardStorage(programmableCard),
    },
    logOut: jest.fn(),
  };
}

export function fakeElectionManagerAuth(
  user: Partial<ElectionManagerUser> = {}
): DippedSmartcardAuth.ElectionManagerLoggedIn {
  return {
    status: 'logged_in',
    user: fakeElectionManagerUser(user),
    logOut: jest.fn(),
  };
}

export function fakeLoggedOutAuth(
  props: Partial<DippedSmartcardAuth.LoggedOut> = {}
): DippedSmartcardAuth.LoggedOut {
  return {
    status: 'logged_out',
    reason: 'machine_locked',
    ...props,
  };
}
