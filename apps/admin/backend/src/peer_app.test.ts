import { expect, test } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS, DEV_MACHINE_ID } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { HostConnectionStatus } from './types';
import { buildTestEnvironment, configureMachine } from '../test/app';

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
    status: HostConnectionStatus.Connected,
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
