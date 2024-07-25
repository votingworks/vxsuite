import { assert } from '@votingworks/basics';
import {
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { isIntegrationTest } from '@votingworks/utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { Workspace } from './workspace';

/**
 * Construct the auth state machine based on the election state in the store.
 */
export function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const electionRecord = (() => {
    const electionId = workspace.store.getCurrentElectionId();
    if (!electionId) {
      return undefined;
    }
    const record = workspace.store.getElection(electionId);
    assert(record);
    return record;
  })();

  /* istanbul ignore next - covered by integration testing */
  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  if (!electionRecord) {
    return {
      ...DEFAULT_SYSTEM_SETTINGS.auth,
      jurisdiction,
    };
  }

  const systemSettings = workspace.store.getSystemSettings(electionRecord.id);
  return {
    ...systemSettings.auth,
    electionKey: constructElectionKey(
      electionRecord.electionDefinition.election
    ),
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
  /* istanbul ignore next - trivial fallback case */
  return 'unknown';
}
