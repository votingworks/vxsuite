import {
  DEV_JURISDICTION,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS, TEST_JURISDICTION } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { isIntegrationTest } from '@votingworks/utils';
import { LocalWorkspace, PeerWorkspace } from './types';

export function constructAuthMachineState(
  workspace: LocalWorkspace | PeerWorkspace
): DippedSmartCardAuthMachineState {
  const election = workspace.store.getElection();
  const { configuredPrecinctId } =
    workspace.store.getPollbookConfigurationInformation();

  const jurisdiction = isIntegrationTest()
    ? TEST_JURISDICTION
    : process.env.VX_MACHINE_JURISDICTION ?? DEV_JURISDICTION;

  return {
    ...DEFAULT_SYSTEM_SETTINGS['auth'],
    electionKey: election && {
      id: election.id,
      date: election.date,
    },
    isConfigured: Boolean(election && configuredPrecinctId),
    jurisdiction,
    machineType: 'poll-book',
  };
}

/**
 * Get the current logging user role.
 */
export async function getUserRole(
  auth: DippedSmartCardAuthApi,
  workspace: LocalWorkspace
): Promise<LoggingUserRole> {
  const authStatus = await auth.getAuthStatus(
    constructAuthMachineState(workspace)
  );
  if (authStatus.status === 'logged_in') {
    return authStatus.user.role;
  }
  /* istanbul ignore next - trivial fallback case @preserve */
  return 'unknown';
}
