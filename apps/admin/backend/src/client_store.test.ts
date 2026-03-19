import { expect, test } from 'vitest';
import * as grout from '@votingworks/grout';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { ClientStore, HostConnection } from './client_store';
import { ClientConnectionStatus, ElectionRecord } from './types';
import type { PeerApi } from './peer_app';

function createMockPeerApiClient(): grout.Client<PeerApi> {
  // Not calling any API methods in these tests, just storing the reference
  return new Proxy({}, { get: () => () => undefined }) as grout.Client<PeerApi>;
}

const electionDefinition = readElectionGeneralDefinition();

function makeElectionRecord(): ElectionRecord {
  return {
    id: 'election-id',
    electionDefinition,
    createdAt: new Date().toISOString(),
    isOfficialResults: false,
    electionPackageHash: 'test-hash',
  };
}

test('starts with offline status and no data', () => {
  const store = new ClientStore();
  expect(store.getConnectionStatus()).toEqual(ClientConnectionStatus.Offline);
  expect(store.getHostConnection()).toBeUndefined();
  expect(store.getCurrentElectionId()).toBeUndefined();
  expect(store.getElectionKey('')).toBeUndefined();
  expect(store.getSystemSettings('')).toBeUndefined();
  expect(store.getCachedElectionRecord()).toBeUndefined();
  expect(store.getCachedSystemSettings()).toBeUndefined();
});

test('caches election record and derives election key', () => {
  const store = new ClientStore();
  const record = makeElectionRecord();

  store.setCachedElectionRecord(record);

  expect(store.getCurrentElectionId()).toEqual('election-id');
  expect(store.getCachedElectionRecord()).toEqual(record);
  expect(store.getElectionKey(record.id)).toEqual(
    constructElectionKey(electionDefinition.election)
  );
  store.setCachedSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  expect(store.getSystemSettings(record.id)).toEqual(DEFAULT_SYSTEM_SETTINGS);
  expect(store.getCachedSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('clears cached data when connection is lost', () => {
  const store = new ClientStore();
  store.setCachedElectionRecord(makeElectionRecord());
  store.setCachedSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  store.setConnection(ClientConnectionStatus.OnlineWaitingForHost);

  expect(store.getCachedElectionRecord()).toBeUndefined();
  expect(store.getCachedSystemSettings()).toBeUndefined();
  expect(store.getCurrentElectionId()).toBeUndefined();
  expect(store.getElectionKey('')).toBeUndefined();
});

test('preserves cached data when connected to host', () => {
  const store = new ClientStore();
  const record = makeElectionRecord();
  store.setCachedElectionRecord(record);
  store.setCachedSystemSettings(DEFAULT_SYSTEM_SETTINGS);

  const hostConnection: HostConnection = {
    address: 'http://192.168.1.1:3002',
    machineId: 'HOST-001',
    apiClient: createMockPeerApiClient(),
  };
  store.setConnection(
    ClientConnectionStatus.OnlineConnectedToHost,
    hostConnection
  );

  expect(store.getCachedElectionRecord()).toEqual(record);
  expect(store.getCachedSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);
  expect(store.getHostConnection()).toMatchObject({
    address: 'http://192.168.1.1:3002',
    machineId: 'HOST-001',
  });
});
