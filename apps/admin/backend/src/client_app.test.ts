import { beforeEach, expect, test, vi } from 'vitest';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { DEV_MACHINE_ID } from '@votingworks/types';
import { buildClientApp, ClientApi } from './client_app';
import { createWorkspace } from './util/workspace';
import {
  mockMachineLocked,
  mockSystemAdministratorAuth,
  buildMockLogger,
} from '../test/app';

function buildClientTestEnvironment() {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspaceRoot = tmp.dirSync().name;
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(workspaceRoot, baseLogger);
  const logger = buildMockLogger(auth, workspace);
  const app = buildClientApp({ auth, workspace, logger });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<ClientApi>({
    baseUrl: `http://localhost:${port}/api`,
  });

  mockMachineLocked(auth);

  return { auth, workspace, apiClient, server };
}

let env: ReturnType<typeof buildClientTestEnvironment>;

beforeEach(() => {
  env = buildClientTestEnvironment();
  return () => {
    env.server.close();
  };
});

test('getMachineConfig returns machine config', async () => {
  const config = await env.apiClient.getMachineConfig();
  expect(config).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('getMachineMode returns host by default', async () => {
  const mode = await env.apiClient.getMachineMode();
  expect(mode).toEqual('host');
});

test('setMachineMode and getMachineMode round-trip', async () => {
  await env.apiClient.setMachineMode({ mode: 'client' });
  expect(await env.apiClient.getMachineMode()).toEqual('client');

  await env.apiClient.setMachineMode({ mode: 'host' });
  expect(await env.apiClient.getMachineMode()).toEqual('host');
});

test('getAuthStatus returns auth status', async () => {
  const authStatus = await env.apiClient.getAuthStatus();
  expect(authStatus).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});

test('checkPin delegates to auth', async () => {
  mockSystemAdministratorAuth(env.auth);
  await env.apiClient.checkPin({ pin: '000000' });
  expect(env.auth.checkPin).toHaveBeenCalled();
});

test('logOut delegates to auth', async () => {
  mockSystemAdministratorAuth(env.auth);
  await env.apiClient.logOut();
  expect(env.auth.logOut).toHaveBeenCalled();
});
