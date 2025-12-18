import {
  DippedSmartCardAuth,
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { BaseLogger, LoggingUserRole } from '@votingworks/logging';
import {
  isFeatureFlagEnabled,
  BooleanEnvironmentVariableName,
  isIntegrationTest,
} from '@votingworks/utils';
import { Workspace } from './workspace';
import { Store } from '../store';

/* istanbul ignore next - @preserve */
export function getDefaultAuth(logger: BaseLogger): DippedSmartCardAuth {
  return new DippedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: {
      allowElectionManagersToAccessUnconfiguredMachines: true,
      allowedUserRoles: [
        'vendor',
        'system_administrator',
        'election_manager',
        'poll_worker',
      ],
    },
    logger,
  });
}

export function constructAuthMachineState(
  store: Store
): DippedSmartCardAuthMachineState {
  const electionKey = store.getElectionKey();
  const machineType = 'print';
  const systemSettings = store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  const jurisdiction = store.getJurisdiction();
  const requiresPrecinctSelection = store.getPrecinctSelection() === undefined;
  return {
    ...systemSettings.auth,
    electionKey,
    jurisdiction,
    machineType,
    isConfigured: !!electionKey && !requiresPrecinctSelection,
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
