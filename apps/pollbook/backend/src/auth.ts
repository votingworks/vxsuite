import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { LoggingUserRole } from '@votingworks/logging';
import { LocalWorkspace, PeerWorkspace } from './types';

export function constructAuthMachineState(
  workspace: LocalWorkspace | PeerWorkspace
): DippedSmartCardAuthMachineState {
  const election = workspace.store.getElection();
  return {
    ...DEFAULT_SYSTEM_SETTINGS['auth'],
    electionKey: election && {
      id: election.id,
      date: election.date,
    },
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
