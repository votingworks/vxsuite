import { CardDataTypes } from './election';

export type UserSession =
  | PollworkerUserSession
  | VoterUserSession
  | AdminUserSession
  | SuperAdminUserSession
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
export interface SuperAdminUserSession {
  readonly type: 'superadmin';
  readonly authenticated: boolean;
}
export interface UnknownUserSession {
  readonly type: 'unknown';
  readonly authenticated: false;
  readonly attemptedUserType?: CardDataTypes;
}
