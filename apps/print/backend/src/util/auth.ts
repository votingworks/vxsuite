import {
  DippedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Workspace } from './workspace';
import { Store } from '../store';

export function constructAuthMachineState(
  store: Store
): InsertedSmartCardAuthMachineState {
  const electionKey = store.getElectionKey();
  const machineType = 'print';
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  const jurisdiction = store.getJurisdiction();
  return {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
  };
}

export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace.store)
  );
  return authStatus.status === 'logged_in'
    ? authStatus.user.role
    : /* istanbul ignore next - @preserve */ 'unknown';
}
