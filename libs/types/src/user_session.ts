import { CardDataTypes } from './election';

export type UserSession =
  | PollworkerUserSession
  | VoterUserSession
  | AdminUserSession
  | UnknownUserSession;
export interface PollworkerUserSession {
  readonly type: 'pollworker';
  readonly authenticated: boolean;
  readonly isElectionHashValid: boolean;
}
export interface VoterUserSession {
  readonly type: 'voter';
  readonly authenticated: boolean;
}
export interface AdminUserSession {
  readonly type: 'admin';
  readonly authenticated: boolean;
}
export interface UnknownUserSession {
  readonly type: 'unknown';
  readonly authenticated: false;
  readonly attemptedUserType?: CardDataTypes;
}
