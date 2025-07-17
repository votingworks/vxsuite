import { describe, expect, test, vi } from 'vitest';
import { safeParseSystemSettings, TEST_JURISDICTION } from '@votingworks/types';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { PrintMode, Store } from './store';

// We pause in some of these tests so we need to increase the timeout
vi.setConfig({
  testTimeout: 20_000,
});

const jurisdiction = TEST_JURISDICTION;

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('get/set/has election', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.hasElection()).toBeTruthy();

  store.setElectionAndJurisdiction(undefined);
  expect(store.getElectionRecord()).toBeUndefined();
});

test('get/set/delete system settings', () => {
  const store = Store.memoryStore();

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionTwoPartyPrimaryFixtures.systemSettings.asText()
  ).unsafeUnwrap();

  store.setSystemSettings(systemSettings);
  expect(store.getSystemSettings()).toEqual(systemSettings);

  store.deleteSystemSettings();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('errors when election definition cannot be parsed', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData: '{malformed json',
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(() => store.getElectionRecord()).toThrow(SyntaxError);
});

test('reset clears the database', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const store = Store.memoryStore();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.hasElection()).toBeTruthy();
  store.reset();
  expect(store.hasElection()).toBeFalsy();
});

describe('printMode', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();

  function newStore() {
    const store = Store.memoryStore();

    store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
    });

    return store;
  }

  test('get - schema default', () => {
    expect(newStore().getPrintMode()).toEqual<PrintMode>('summary');
  });

  test('set and get rountrip', () => {
    const store = newStore();
    store.setPrintMode('bubble_marks');
    expect(store.getPrintMode()).toEqual<PrintMode>('bubble_marks');
  });

  test('set - invalid mode', () => {
    expect(() => newStore().setPrintMode('invalid' as PrintMode)).toThrowError(
      'invalid print mode'
    );
  });

  test('get - no election', () => {
    expect(Store.memoryStore().getPrintMode()).toEqual<PrintMode>('summary');
  });

  test('set - no election', () => {
    expect(() => Store.memoryStore().setPrintMode('bubble_marks')).toThrowError(
      /without an election/
    );
  });
});
