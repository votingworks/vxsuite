import {
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { isIntegrationTest } from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS, TEST_JURISDICTION } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import type { BaseStore } from '../types';

/**
 * Construct the auth machine state from the store's election state. When the
 * store has no current election, returns defaults.
 */
export function constructAuthMachineState(
  store: BaseStore
): DippedSmartCardAuthMachineState {
  const electionId = store.getCurrentElectionId();

  /* istanbul ignore next - covered by integration testing @preserve */
  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  if (!electionId) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
      machineType: 'admin',
    };
  }

  const systemSettings =
    store.getSystemSettings(electionId) ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionKey: store.getElectionKey(electionId),
    jurisdiction,
    machineType: 'admin',
  };
}

/**
 * Get the current logging user role.
 */
export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  store: BaseStore
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(constructAuthMachineState(store));
  if (authStatus.status === 'logged_in') {
    return authStatus.user.role;
  }
  /* istanbul ignore next - trivial fallback case @preserve */
  return 'unknown';
}
