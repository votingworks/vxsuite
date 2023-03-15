import {
  ElectionManagerUser,
  SystemAdministratorUser,
  User,
  UserRole,
} from './auth';

export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'card_error'
    | 'election_manager_wrong_election'
    | 'invalid_user_on_card'
    | 'machine_locked'
    | 'machine_not_configured'
    | 'user_role_not_allowed';
  readonly cardUserRole?: UserRole;
}

export interface CheckingPin {
  readonly status: 'checking_pin';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
  readonly error?: true;
  readonly wrongPinEnteredAt?: Date;
}

export interface RemoveCard {
  readonly status: 'remove_card';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
}

export type ProgrammableCard =
  | { status: 'no_card' | 'error' }
  | { status: 'ready'; programmedUser?: User };

export interface SystemAdministratorLoggedIn {
  readonly status: 'logged_in';
  readonly user: SystemAdministratorUser;
  readonly programmableCard: ProgrammableCard;
}

export interface ElectionManagerLoggedIn {
  readonly status: 'logged_in';
  readonly user: ElectionManagerUser;
}

export type LoggedIn = SystemAdministratorLoggedIn | ElectionManagerLoggedIn;

export type AuthStatus = LoggedOut | CheckingPin | RemoveCard | LoggedIn;

export const DEFAULT_AUTH_STATUS: Readonly<AuthStatus> = {
  status: 'logged_out',
  reason: 'machine_locked',
};
