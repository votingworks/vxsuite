import { CardSummaryNotReady } from '../card';
import {
  ElectionManagerUser,
  CardProgramming,
  CardStorage,
  SystemAdministratorUser,
  UserRole,
} from './auth';

export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'machine_locked'
    | 'card_error'
    | 'invalid_user_on_card'
    | 'user_role_not_allowed'
    | 'machine_not_configured'
    | 'election_manager_wrong_election';
  readonly cardUserRole?: UserRole;
}

export interface CheckingPasscode {
  readonly status: 'checking_passcode';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
  readonly checkPasscode: (passcode: string) => void;
  readonly wrongPasscodeEnteredAt?: Date;
}

export interface RemoveCard {
  readonly status: 'remove_card';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
}

export interface SystemAdministratorLoggedIn {
  readonly status: 'logged_in';
  readonly user: SystemAdministratorUser;
  readonly card:
    | CardSummaryNotReady['status']
    | (CardStorage & CardProgramming);
  readonly logOut: () => void;
}

export interface ElectionManagerLoggedIn {
  readonly status: 'logged_in';
  readonly user: ElectionManagerUser;
  readonly card: CardSummaryNotReady['status'] | CardStorage;
  readonly logOut: () => void;
}

export type LoggedIn = SystemAdministratorLoggedIn | ElectionManagerLoggedIn;

export type Auth = LoggedOut | CheckingPasscode | RemoveCard | LoggedIn;
