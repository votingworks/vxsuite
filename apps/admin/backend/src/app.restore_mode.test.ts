import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockSystemAdministratorAuth,
} from '../test/app.js';

vi.setConfig({ testTimeout: 30_000 });

let env: ReturnType<typeof buildTestEnvironment>;

beforeEach(() => {
  env = buildTestEnvironment();
  mockSystemAdministratorAuth(env.auth);
});

afterEach(() => {
  env.peerServer.close();
});

test('a host describes itself as one', async () => {
  expect(await env.apiClient.getAppMode()).toEqual('host');
});

test('scheduling restore mode asks the next boot to start there', async () => {
  const { apiClient, bootIntentController, logger } = env;

  await apiClient.scheduleRestoreMode();

  expect(bootIntentController.take()).toEqual('restore');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.AdminRestoreModeScheduled,
    'system_administrator',
    expect.objectContaining({ disposition: 'success' })
  );
});

test('restore mode cannot be scheduled while an election is configured', async () => {
  const { apiClient, auth, bootIntentController } = env;
  await configureMachine(apiClient, auth, readElectionGeneralDefinition());

  await suppressingConsoleOutput(() =>
    expect(apiClient.scheduleRestoreMode()).rejects.toThrow(
      'Cannot restore while an election is configured.'
    )
  );
  expect(bootIntentController.take()).toBeUndefined();
});

test('restore mode cannot be scheduled from a client', async () => {
  const { apiClient, bootIntentController } = env;
  await apiClient.setMachineMode({ mode: 'client' });

  await suppressingConsoleOutput(() =>
    expect(apiClient.scheduleRestoreMode()).rejects.toThrow(
      'Only a host can be restored.'
    )
  );
  expect(bootIntentController.take()).toBeUndefined();
});
