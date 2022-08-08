import { BallotStyleId, PrecinctId } from '../election';
import { Result } from '../result';
import {
  ElectionManagerUser,
  CardlessVoterUser,
  CardStorage,
  PollWorkerUser,
  SystemAdministratorUser,
  VoterUser,
  UserRole,
} from './auth';

// Auth status types
export interface LoggedOut {
  readonly status: 'logged_out';
  readonly reason:
    | 'no_card'
    | 'card_error'
    | 'invalid_user_on_card'
    | 'user_role_not_allowed'
    | 'machine_not_configured'
    | 'election_manager_wrong_election'
    | 'poll_worker_wrong_election'
    | 'voter_wrong_election'
    | 'voter_wrong_precinct'
    | 'voter_card_expired'
    | 'voter_card_voided'
    | 'voter_card_printed';
  readonly cardUserRole?: UserRole;
}

export interface SystemAdministratorLoggedIn {
  readonly status: 'logged_in';
  readonly user: SystemAdministratorUser;
  readonly card: CardStorage;
}

export interface ElectionManagerLoggedIn {
  readonly status: 'logged_in';
  readonly user: ElectionManagerUser;
  readonly card: CardStorage;
}

export interface PollWorkerLoggedIn {
  readonly status: 'logged_in';
  readonly user: PollWorkerUser;
  readonly card: CardStorage;
  // A pollworker can "activate" a cardless voter session by selecting a
  // precinct and ballot style. The activated cardless voter session begins when
  // the pollworker removes their card, at which point the auth switches to
  // CardlessVoterLoggedInAuth.
  readonly activateCardlessVoter: (
    precinctId: PrecinctId,
    ballotStyleId: BallotStyleId
  ) => void;
  readonly deactivateCardlessVoter: () => void;
  readonly activatedCardlessVoter?: CardlessVoterUser;
}

export interface VoterLoggedIn {
  readonly status: 'logged_in';
  readonly user: VoterUser;
  readonly card: CardStorage;
  readonly markCardVoided: () => Promise<Result<void, Error>>;
  readonly markCardPrinted: () => Promise<Result<void, Error>>;
}

export interface CardlessVoterLoggedIn {
  readonly status: 'logged_in';
  readonly user: CardlessVoterUser;
  readonly logOut: () => void;
}

export interface CheckingPasscode {
  readonly status: 'checking_passcode';
  readonly user: SystemAdministratorUser | ElectionManagerUser;
  readonly checkPasscode: (passcode: string) => void;
  readonly wrongPasscodeEnteredAt?: Date;
}

export type LoggedIn =
  | SystemAdministratorLoggedIn
  | ElectionManagerLoggedIn
  | PollWorkerLoggedIn
  | VoterLoggedIn
  | CardlessVoterLoggedIn;

export type Auth = LoggedOut | CheckingPasscode | LoggedIn;
