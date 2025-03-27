import { beforeEach, describe, expect, test, vi } from 'vitest';

let mockNodeEnv: 'production' | 'test' = 'test';

vi.mock(
  './globals.js',
  async (importActual): Promise<typeof import('./globals')> => ({
    ...(await importActual()),
    get NODE_ENV(): 'production' | 'test' {
      return mockNodeEnv;
    },
  })
);

beforeEach(() => {
  mockNodeEnv = 'test';
  vi.clearAllMocks();
});

vi.setConfig({
  testTimeout: 20_000,
});

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
  };

  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = buildTestEnvironment();
  expect(await apiClient.getMachineConfig()).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('managing the current election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // try configuring with a malformed election package
  const badConfigureResult = await apiClient.configure({
    electionFilePath: saveTmpFile('{}'),
  });
  expect(badConfigureResult).toEqual(
    err(expect.objectContaining({ type: 'invalid-zip' }))
  );
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});
