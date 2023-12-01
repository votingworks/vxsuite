import {
  CardlessVoterUser,
  ElectionManagerUser,
  PollWorkerUser,
  SystemAdministratorUser,
  UserWithCard,
} from './auth';

export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'no_card_reader'
    | 'card_error'
    | 'invalid_user_on_card'
    | 'machine_not_configured'
    | 'no_card'
    | 'wrong_election'
    | 'wrong_jurisdiction';
  readonly cardJurisdiction?: string;
  readonly cardUserRole?: UserWithCard['role'];
  readonly machineJurisdiction?: string;
}

export interface CheckingPin {
  readonly status: 'checking_pin';
  readonly user: SystemAdministratorUser | ElectionManagerUser | PollWorkerUser;
  readonly error?: true;
  readonly lockedOutUntil?: Date;
  readonly wrongPinEnteredAt?: Date;
}

export interface SystemAdministratorLoggedIn {
  readonly status: 'logged_in';
  readonly user: SystemAdministratorUser;
  readonly sessionExpiresAt: Date;
}

export interface ElectionManagerLoggedIn {
  readonly status: 'logged_in';
  readonly user: ElectionManagerUser;
  readonly sessionExpiresAt: Date;
}

export interface PollWorkerLoggedIn {
  readonly status: 'logged_in';
  readonly user: PollWorkerUser;
  readonly sessionExpiresAt: Date;
  readonly cardlessVoterUser?: CardlessVoterUser;
}

export interface CardlessVoterLoggedIn {
  readonly status: 'logged_in';
  readonly user: CardlessVoterUser;
  readonly sessionExpiresAt: Date;
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
