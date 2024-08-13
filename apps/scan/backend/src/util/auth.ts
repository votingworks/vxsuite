import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Store } from '../store';
import { Workspace } from './workspace';

export function constructAuthMachineState(
  store: Store
): InsertedSmartCardAuthMachineState {
  const electionKey = store.getElectionKey();
  const jurisdiction = store.getJurisdiction();
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
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
