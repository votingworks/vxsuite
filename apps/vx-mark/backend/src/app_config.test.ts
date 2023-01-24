import { MarkAndPrint, MarkOnly, PrintOnly } from '@votingworks/types';
import { createApp } from '../test/app_helpers';

test('uses machine config from env', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_MACHINE_ID: 'test-machine-id',
    VX_CODE_VERSION: 'test-code-version',
    VX_APP_MODE: 'PrintOnly',
    VX_SCREEN_ORIENTATION: 'landscape',
  };

  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    appMode: PrintOnly,
    machineId: 'test-machine-id',
    codeVersion: 'test-code-version',
    screenOrientation: 'landscape',
  });

  process.env = originalEnv;
});

test('configures as MarkOnly properly', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_APP_MODE: 'MarkOnly',
  };

  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toMatchObject({
    appMode: MarkOnly,
  });

  process.env = originalEnv;
});

test('uses default machine config if not set', async () => {
  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    appMode: MarkAndPrint,
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});

test('defaults to MarkAndPrint on unknown app mode', async () => {
  const originalEnv = process.env;
  process.env = {
    ...originalEnv,
    VX_APP_MODE: 'Alpaca',
  };
  const { apiClient } = createApp();
  expect(await apiClient.getMachineConfig()).toEqual({
    appMode: MarkAndPrint,
    machineId: '0000',
    codeVersion: 'dev',
    screenOrientation: 'portrait',
  });
});
