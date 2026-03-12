import { beforeEach, expect, test, vi } from 'vitest';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { mockBaseLogger } from '@votingworks/logging';
import { DEV_MACHINE_ID } from '@votingworks/types';
import { buildPeerApp, PeerApi } from './peer_app';
import { createWorkspace } from './util/workspace';

function buildPeerTestEnvironment() {
  const workspaceRoot = tmp.dirSync().name;
  const baseLogger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(workspaceRoot, baseLogger);
  const { app, getConnectedClients } = buildPeerApp({ workspace });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<PeerApi>({
    baseUrl: `http://localhost:${port}/api`,
  });

  return { workspace, apiClient, server, getConnectedClients };
}

let env: ReturnType<typeof buildPeerTestEnvironment>;

beforeEach(() => {
  env = buildPeerTestEnvironment();
  return () => {
    env.server.close();
  };
});

test('connectToHost returns ok status', async () => {
  const result = await env.apiClient.connectToHost({
    machineId: 'client-001',
  });
  expect(result).toEqual({ status: 'ok' });
});

test('getHostMachineConfig returns machine config', async () => {
  const config = await env.apiClient.getHostMachineConfig();
  expect(config).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('getConnectedClients tracks connected clients', async () => {
  expect(env.getConnectedClients()).toEqual([]);

  await env.apiClient.connectToHost({ machineId: 'client-001' });
  const clients = env.getConnectedClients();
  expect(clients).toHaveLength(1);
  expect(clients[0]).toMatchObject({ machineId: 'client-001' });
});

test('getConnectedClients removes stale clients', async () => {
  vi.useFakeTimers();
  await env.apiClient.connectToHost({ machineId: 'client-001' });
  expect(env.getConnectedClients()).toHaveLength(1);

  vi.advanceTimersByTime(11_000);
  expect(env.getConnectedClients()).toHaveLength(0);
  vi.useRealTimers();
});
