import { safeParseSystemSettings } from '@votingworks/utils';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { TEST_JURISDICTION } from '@votingworks/types';
import { Store } from './store';

// We pause in some of these tests so we need to increase the timeout
jest.setTimeout(20000);

const jurisdiction = TEST_JURISDICTION;

test('getDbPath', () => {
  const store = Store.memoryStore();
  expect(store.getDbPath()).toEqual(':memory:');
});

test('get/set/has election', () => {
  const { election, electionDefinition } =
    electionMinimalExhaustiveSampleFixtures;
  const store = Store.memoryStore();

  expect(store.getElectionDefinition()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  expect(store.getElectionDefinition()?.election).toEqual(election);
  expect(store.hasElection()).toBeTruthy();

  store.setElectionAndJurisdiction(undefined);
  expect(store.getElectionDefinition()).toBeUndefined();
});

test('get/set/delete system settings', () => {
  const store = Store.memoryStore();

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionMinimalExhaustiveSampleFixtures.systemSettings.asText()
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
  });
  expect(() => store.getElectionDefinition()).toThrow(
    'Unable to parse stored election data.'
  );
});

test('reset clears the database', () => {
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const store = Store.memoryStore();

  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction,
  });
  expect(store.hasElection()).toBeTruthy();
  store.reset();
  expect(store.hasElection()).toBeFalsy();
});
