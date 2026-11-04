import { expect, test, vi } from 'vitest';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { DateTime } from 'luxon';
import { importElectionPackageForTest } from '@votingworks/backend/test-utils';
import { Store } from './store.js';
import { configureStore } from '../test/store_helpers.js';

// We pause in some of these tests so we need to increase the timeout
vi.setConfig({ testTimeout: 20000 });

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('get/set/has election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
  expect(store.getJurisdiction()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  await configureStore(store, { electionDefinition });
  expect(store.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getElectionKey()).toEqual({
    id: electionDefinition.election.id,
    date: electionDefinition.election.date,
  });
  expect(store.getJurisdiction()).toEqual(TEST_JURISDICTION);
  expect(store.hasElection()).toBeTruthy();

  store.reset();
  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();
});

test('fileStore', async () => {
  const sessionDbPath = makeTemporaryFile();
  const electionPackageDbPath = makeTemporaryFile();
  const store = Store.fileStore(
    sessionDbPath,
    electionPackageDbPath,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(store.getDbPath()).toEqual(sessionDbPath);
  expect(store.getElectionPackageStore().getDbPath()).toEqual(
    electionPackageDbPath
  );

  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  await configureStore(store, { electionDefinition });
  expect(store.getElectionRecord()?.electionDefinition).toEqual(
    electionDefinition
  );
  store.close();
});

test('close', () => {
  const store = Store.memoryStore();
  store.close();
  expect(() => store.hasElection()).toThrow(/is closed/);
  expect(() => store.getElectionRecord()).toThrow(/is closed/);
});

test('get system settings', async () => {
  const store = Store.memoryStore();

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionTwoPartyPrimaryFixtures.systemSettings.asText()
  ).unsafeUnwrap();

  await configureStore(store, {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
    systemSettings,
  });
  expect(store.getSystemSettings()).toEqual(systemSettings);

  store.reset();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('get/set ballots cast since last box change', async () => {
  const store = Store.memoryStore();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  // 0 if no election is defined
  expect(store.getBallotsCastSinceLastBoxChange()).toEqual(0);

  await configureStore(store, { electionDefinition });

  // Initialized to 0 when election is defined
  expect(store.getBallotsCastSinceLastBoxChange()).toEqual(0);

  store.setBallotsCastSinceLastBoxChange(1);
  expect(store.getBallotsCastSinceLastBoxChange()).toEqual(1);
});

test('getElectricalTestingStatusMessages and setElectricalTestingStatusMessage', () => {
  const store = Store.memoryStore();

  expect(store.getElectricalTestingStatusMessages()).toEqual([]);

  store.setElectricalTestingStatusMessage('card', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);

  store.setElectricalTestingStatusMessage('paperHandler', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
    {
      component: 'paperHandler',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);

  store.setElectricalTestingStatusMessage('card', 'Error: No card');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Error: No card',
      updatedAt: expect.any(DateTime),
    },
    {
      component: 'paperHandler',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);
});

test('an imported package without an election session is not configured', async () => {
  const store = Store.memoryStore();
  await importElectionPackageForTest(store.getElectionPackageStore(), {
    electionDefinition:
      electionTwoPartyPrimaryFixtures.readElectionDefinition(),
  });

  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
});
