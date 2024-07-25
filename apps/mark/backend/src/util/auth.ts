import {
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
} from '@votingworks/auth';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
} from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Workspace } from './workspace';

export function constructAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionRecord = workspace.store.getElectionRecord();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings =
    workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionKey:
      electionRecord &&
      constructElectionKey(electionRecord.electionDefinition.election),
    jurisdiction,
  };
}

export async function getUserRole(
  auth: InsertedSmartCardAuthApi,
  workspace: Workspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace)
  );
  return authStatus.status === 'logged_in'
    ? authStatus.user.role
    : /* istanbul ignore next */ 'unknown';
}
