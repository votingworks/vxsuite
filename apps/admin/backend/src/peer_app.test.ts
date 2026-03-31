import { expect, test } from 'vitest';
import {
  Admin,
  DEFAULT_SYSTEM_SETTINGS,
  DEV_MACHINE_ID,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';

import { buildTestEnvironment, configureMachine } from '../test/app';

test('connectToHost registers client and returns host machine config with adjudication status', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();
  const result = await peerApiClient.connectToHost({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
  expect(result).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    isClientAdjudicationEnabled: false,
  });

  const machines = workspace.store.getMachines();
  expect(machines).toHaveLength(1);
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    machineMode: 'client',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
});

test('connectToHost persists status and authType and returns adjudication enabled', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  workspace.store.setIsClientAdjudicationEnabled(true);
  const result = await peerApiClient.connectToHost({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
  expect(result.isClientAdjudicationEnabled).toEqual(true);

  const machines = workspace.store.getMachines();
  expect(machines[0]).toMatchObject({
    machineId: 'client-001',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test('connectToHost updates store when client status changes', async () => {
  const { peerApiClient, workspace } = buildTestEnvironment();

  // First call: new client
  await peerApiClient.connectToHost({
    machineId: 'client-002',
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.OnlineLocked,
    authType: null,
  });

  // Second call: status changes
  await peerApiClient.connectToHost({
    machineId: 'client-002',
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
  expect(workspace.store.getMachine('client-002')).toMatchObject({
    status: Admin.ClientMachineStatus.Active,
    authType: 'election_manager',
  });
});

test('getCurrentElectionMetadata returns null when no election configured', async () => {
  const { peerApiClient } = buildTestEnvironment();
  const result = await peerApiClient.getCurrentElectionMetadata();
  expect(result).toBeUndefined();
});

test('getCurrentElectionMetadata returns election record when configured', async () => {
  const { peerApiClient, apiClient, auth } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  const result = await peerApiClient.getCurrentElectionMetadata();
  expect(result).toBeDefined();
  expect(result?.electionDefinition.election.title).toEqual(
    electionDefinition.election.title
  );
});

test('getSystemSettings returns null when no election configured', async () => {
  const { peerApiClient } = buildTestEnvironment();
  const result = await peerApiClient.getSystemSettings();
  expect(result).toBeUndefined();
});

test('getSystemSettings returns settings when election configured', async () => {
  const { peerApiClient, apiClient, auth } = buildTestEnvironment();
  const electionDefinition = readElectionGeneralDefinition();
  await configureMachine(apiClient, auth, electionDefinition);

  const result = await peerApiClient.getSystemSettings();
  expect(result).toEqual(DEFAULT_SYSTEM_SETTINGS);
});
