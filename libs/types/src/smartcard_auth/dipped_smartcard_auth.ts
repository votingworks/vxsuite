import { AdminUser, CardStorage, SuperadminUser } from './auth';

export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'machine_locked'
    | 'card_error'
    | 'invalid_user_on_card'
    | 'user_role_not_allowed';
  readonly bootstrapAuthenticatedAdminSession: (electionHash: string) => void;
}

export interface CheckingPasscode {
  readonly status: 'checking_passcode';
  readonly user: AdminUser;
  readonly checkPasscode: (passcode: string) => void;
  readonly passcodeError?: 'wrong_passcode';
}

export interface RemoveCard {
  readonly status: 'remove_card';
  readonly user: SuperadminUser | AdminUser;
}

export interface SuperadminLoggedIn {
  readonly status: 'logged_in';
  readonly user: SuperadminUser;
  readonly card?: CardStorage;
  readonly logOut: () => void;
}

export interface AdminLoggedIn {
  readonly status: 'logged_in';
  readonly user: AdminUser;
  readonly card?: CardStorage;
  readonly logOut: () => void;
}

export type LoggedIn = SuperadminLoggedIn | AdminLoggedIn;

export type Auth = LoggedOut | CheckingPasscode | RemoveCard | LoggedIn;
