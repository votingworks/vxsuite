import type {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import type { LoggingUserRole } from '@votingworks/logging';
import type { Store } from '../store.js';
import type { Workspace } from './workspace.js';

export function constructAuthMachineState(
  store: Store
): InsertedSmartCardAuthMachineState {
  const electionKey = store.getElectionKey();
  const jurisdiction = store.getJurisdiction();
  const machineType = 'scan';
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  };
}

export async function getUserRole(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace.store)
  );
  if (authStatus.status === 'logged_in') {
    return authStatus.user.role;
  }
  return 'unknown';
}
