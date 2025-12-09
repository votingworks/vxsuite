import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { Election, safeParseElection } from '@votingworks/types';
import { convertMsElection } from './convert_ms_election';
import { TestStore } from '../test/test_store';
import { Jurisdiction } from './types';
import { readFixture } from '../test/helpers';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);
const store = testStore.getStore();
const org: Jurisdiction = {
  id: 'test-org-id',
  name: 'Test Org',
};

beforeAll(async () => {
  await testStore.init();
  await store.createJurisdiction(org);
});

afterAll(async () => {
  await testStore.cleanUp();
});

async function expectValidElection(election: Election) {
  await store.createElection(org.id, election, 'VxDefaultBallot');
  expect(
    safeParseElection((await store.getElection(election.id)).election).err()
  ).toBeUndefined();
}

test('convert general election', async () => {
  const election = convertMsElection(
    'election-id-1',
    readFixture('ms-sems-election-general-10.csv'),
    readFixture('ms-sems-election-candidates-general-10.csv')
  );
  await expectValidElection(election);
  expect(election).toMatchSnapshot();
});

test('convert primary election', async () => {
  const election = convertMsElection(
    'election-id-2',
    readFixture('ms-sems-election-primary-60.csv'),
    readFixture('ms-sems-election-candidates-primary-60.csv')
  );
  await expectValidElection(election);
  expect(election).toMatchSnapshot();
});

test('convert election with ballot measures', async () => {
  const election = convertMsElection(
    'election-id-3',
    readFixture('ms-sems-election-general-ballot-measures-10.csv'),
    readFixture('ms-sems-election-candidates-general-ballot-measures-10.csv')
  );
  await expectValidElection(election);
  expect(election).toMatchSnapshot();
});

test('convert election with precinct splits', async () => {
  const election = convertMsElection(
    'election-id-4',
    readFixture('ms-sems-election-primary-precinct-splits-75.csv'),
    readFixture('ms-sems-election-candidates-primary-precinct-splits-75.csv')
  );
  await expectValidElection(election);
  expect(election).toMatchSnapshot();
});
