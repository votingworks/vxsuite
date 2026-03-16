import { expect, test } from 'vitest';
import { DEV_MACHINE_ID } from '@votingworks/types';
import { AdminConnectionStatus } from './types';
import { buildTestEnvironment } from '../test/app';

test('connectToHost registers client and returns host machine config', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const result = await peerApiClient.connectToHost({
    machineId: 'client-001',
  });
  expect(result).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });

  const machines = workspace.store.getMachines();
  expect(machines).toHaveLength(1);
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    machineMode: 'client',
    status: AdminConnectionStatus.Connected,
  });
});
