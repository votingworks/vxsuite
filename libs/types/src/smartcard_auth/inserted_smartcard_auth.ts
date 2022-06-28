import { BallotStyleId, PrecinctId } from '../election';
import { Result } from '../result';
import {
  AdminUser,
  CardlessVoterUser,
  CardStorage,
  PollworkerUser,
  SuperadminUser,
  VoterUser,
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
    | 'pollworker_wrong_election'
    | 'voter_wrong_election'
    | 'voter_wrong_precinct'
    | 'voter_card_expired'
    | 'voter_card_voided'
    | 'voter_card_printed';
}

export interface SuperadminLoggedIn {
  readonly status: 'logged_in';
  readonly user: SuperadminUser;
  readonly card: CardStorage;
}

export interface AdminLoggedIn {
  readonly status: 'logged_in';
  readonly user: AdminUser;
  readonly card: CardStorage;
}

export interface PollworkerLoggedIn {
  readonly status: 'logged_in';
  readonly user: PollworkerUser;
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

export type LoggedIn =
  | SuperadminLoggedIn
  | AdminLoggedIn
  | PollworkerLoggedIn
  | VoterLoggedIn
  | CardlessVoterLoggedIn;

export type Auth = LoggedOut | LoggedIn;
