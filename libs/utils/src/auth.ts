import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

export function isSystemAdministratorAuth(
  auth: DippedSmartCardAuth.AuthStatus
): auth is DippedSmartCardAuth.SystemAdministratorLoggedIn;
export function isSystemAdministratorAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.SystemAdministratorLoggedIn;
export function isSystemAdministratorAuth(
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
): boolean {
  return (
    auth.status === 'logged_in' && auth.user.role === 'system_administrator'
  );
}

export function isElectionManagerAuth(
  auth: DippedSmartCardAuth.AuthStatus
): auth is DippedSmartCardAuth.ElectionManagerLoggedIn;
export function isElectionManagerAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.ElectionManagerLoggedIn;
export function isElectionManagerAuth(
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'election_manager';
}

export function isPollWorkerAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.PollWorkerLoggedIn;
export function isPollWorkerAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'poll_worker';
}

export function isCardlessVoterAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.CardlessVoterLoggedIn;
export function isCardlessVoterAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'cardless_voter';
}
