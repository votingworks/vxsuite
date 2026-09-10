import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockSystemAdministratorAuth,
} from '../test/app.js';
import { getRestoreState } from './util/workspace.js';

vi.setConfig({ testTimeout: 30_000 });

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let env: ReturnType<typeof buildTestEnvironment>;

beforeEach(() => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_ADMIN_BACKUP_RESTORE
  );
  env = buildTestEnvironment();
  mockSystemAdministratorAuth(env.auth);
});

afterEach(() => {
  env.peerServer.close();
  featureFlagMock.resetFeatureFlags();
});

test('a host describes itself as one', async () => {
  expect(await env.apiClient.getAppMode()).toEqual('host');
});

test('scheduling restore mode asks the next boot to start there', async () => {
  const { apiClient, logger, workspace } = env;

  await apiClient.scheduleRestoreMode();

  expect(getRestoreState(workspace.path)).toEqual('scheduled');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AdminRestoreModeScheduled,
    'system_administrator',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('restore mode cannot be scheduled while an election is configured', async () => {
  const { apiClient, auth, workspace } = env;
  await configureMachine(apiClient, auth, readElectionGeneralDefinition());

  await suppressingConsoleOutput(() =>
    expect(apiClient.scheduleRestoreMode()).rejects.toThrow(
      'Cannot restore while an election is configured.'
    )
  );
  expect(getRestoreState(workspace.path)).toBeUndefined();
});

test('restore mode cannot be scheduled from a client', async () => {
  const { apiClient, workspace } = env;
  await apiClient.setMachineMode({ mode: 'client' });

  await suppressingConsoleOutput(() =>
    expect(apiClient.scheduleRestoreMode()).rejects.toThrow(
      'Only a host can be restored.'
    )
  );
  expect(getRestoreState(workspace.path)).toBeUndefined();
});

test('restore mode cannot be scheduled unless backup and restore are enabled', async () => {
  const { apiClient, workspace } = env;
  featureFlagMock.resetFeatureFlags();

  await suppressingConsoleOutput(() =>
    expect(apiClient.scheduleRestoreMode()).rejects.toThrow(
      'Backup and restore are not enabled.'
    )
  );
  expect(getRestoreState(workspace.path)).toBeUndefined();
});
