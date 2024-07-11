import {
  InsertedSmartCardAuth,
  InsertedSmartCardAuthApi,
  InsertedSmartCardAuthMachineState,
  JavaCard,
  MockFileCard,
} from '@votingworks/auth';
import { BaseLogger, LoggingUserRole } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  isIntegrationTest,
} from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { Workspace } from './workspace';

export function getDefaultAuth(logger: BaseLogger): InsertedSmartCardAuth {
  return new InsertedSmartCardAuth({
    card:
      isFeatureFlagEnabled(BooleanEnvironmentVariableName.USE_MOCK_CARDS) ||
      isIntegrationTest()
        ? new MockFileCard()
        : new JavaCard(),
    config: { allowCardlessVoterSessions: true },
    logger,
  });
}

export function constructAuthMachineState(
  workspace: Workspace
): InsertedSmartCardAuthMachineState {
  const electionDefinition = workspace.store.getElectionDefinition();
  const jurisdiction = workspace.store.getJurisdiction();
  const systemSettings =
    workspace.store.getSystemSettings() ?? DEFAULT_SYSTEM_SETTINGS;
  return {
    ...systemSettings.auth,
    electionHash: electionDefinition?.electionHash,
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
  return authStatus.status === 'logged_in' ? authStatus.user.role : 'unknown';
}
