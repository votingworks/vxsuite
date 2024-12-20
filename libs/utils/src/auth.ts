import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

export function isVendorAuth(
  auth: DippedSmartCardAuth.AuthStatus
): auth is DippedSmartCardAuth.VendorLoggedIn;
export function isVendorAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.VendorLoggedIn;
export function isVendorAuth(
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
): auth is
  | InsertedSmartCardAuth.VendorLoggedIn
  | DippedSmartCardAuth.VendorLoggedIn;
export function isVendorAuth(
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
): boolean {
  return auth.status === 'logged_in' && auth.user.role === 'vendor';
}

export function isSystemAdministratorAuth(
  auth: DippedSmartCardAuth.AuthStatus
): auth is DippedSmartCardAuth.SystemAdministratorLoggedIn;
export function isSystemAdministratorAuth(
  auth: InsertedSmartCardAuth.AuthStatus
): auth is InsertedSmartCardAuth.SystemAdministratorLoggedIn;
export function isSystemAdministratorAuth(
  auth: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus
): auth is
  | InsertedSmartCardAuth.SystemAdministratorLoggedIn
  | DippedSmartCardAuth.SystemAdministratorLoggedIn;
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
): auth is
  | InsertedSmartCardAuth.ElectionManagerLoggedIn
  | DippedSmartCardAuth.ElectionManagerLoggedIn;
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
