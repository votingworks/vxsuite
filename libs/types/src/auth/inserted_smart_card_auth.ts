import {
  CardlessVoterUser,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  UserRole,
} from './auth';

export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'card_error'
    | 'election_manager_wrong_election'
    | 'invalid_user_on_card'
    | 'machine_not_configured'
    | 'no_card'
    | 'poll_worker_wrong_election'
    | 'user_role_not_allowed';
  readonly cardUserRole?: UserRole;
}

export interface CheckingPin {
  readonly status: 'checking_passcode';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
  readonly wrongPasscodeEnteredAt?: Date;
}

export interface SystemAdministratorLoggedIn {
  readonly status: 'logged_in';
  readonly user: SystemAdministratorUser;
}

export interface ElectionManagerLoggedIn {
  readonly status: 'logged_in';
  readonly user: ElectionManagerUser;
}

export interface PollWorkerLoggedIn {
  readonly status: 'logged_in';
  readonly user: PollWorkerUser;
  readonly cardlessVoterUser?: CardlessVoterUser;
}

export interface CardlessVoterLoggedIn {
  readonly status: 'logged_in';
  readonly user: CardlessVoterUser;
}

export type LoggedIn =
  | SystemAdministratorLoggedIn
  | ElectionManagerLoggedIn
  | PollWorkerLoggedIn
  | CardlessVoterLoggedIn;

export type AuthStatus = LoggedOut | CheckingPin | LoggedIn;

export const DEFAULT_AUTH_STATUS: Readonly<AuthStatus> = {
  status: 'logged_out',
  reason: 'no_card',
};
