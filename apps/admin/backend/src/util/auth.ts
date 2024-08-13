import {
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { isIntegrationTest } from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS, TEST_JURISDICTION } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Workspace } from './workspace';

/**
 * Construct the auth state machine based on the election state in the store.
 */
export function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionId = workspace.store.getCurrentElectionId();

  /* c8 ignore next 3 - covered by integration testing */
  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  if (!electionId) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
    };
  }

  const systemSettings = workspace.store.getSystemSettings(electionId);
  return {
    ...systemSettings.auth,
    electionKey: workspace.store.getElectionKey(electionId),
    jurisdiction,
  };
}

/**
 * Get the current logging user role.
 */
export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  workspace: Workspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace)
  );
  if (authStatus.status === 'logged_in') {
    return authStatus.user.role;
  }
  /* c8 ignore next 2 - trivial fallback case */
  return 'unknown';
}
