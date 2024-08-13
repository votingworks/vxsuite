import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Workspace } from './workspace';

export function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionKey = workspace.store.getElectionKey();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings =
    workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
  };
}

export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace)
  );
  return authStatus.status === 'logged_in' ? authStatus.user.role : 'unknown';
}
