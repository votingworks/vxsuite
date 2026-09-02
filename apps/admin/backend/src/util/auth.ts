import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { getMachineJurisdiction } from '../machine_config.js';
import type { BaseStore } from '../types.js';

/**
 * Construct the auth machine state from the store's election state. When the
 * store has no current election, returns defaults.
 */
export function constructAuthMachineState(
  store: BaseStore
): DippedSmartCardAuthMachineState {
  const electionId = store.getCurrentElectionId();

  const jurisdiction = getMachineJurisdiction();

  if (!electionId) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
      machineType: 'admin',
      isConfigured: false,
    };
  }

  const systemSettings =
    // @coverage-defer
    store.getSystemSettings(electionId) ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    isConfigured: true,
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
  return 'unknown';
}
