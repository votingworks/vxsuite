import { test, expect, vi, beforeAll, afterAll } from 'vitest';
import { mockBaseLogger } from '@votingworks/logging';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertMsElection } from './convert_ms_election';
import { TestStore } from '../test/test_store';
import { Org } from './types';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);
const store = testStore.getStore();
const org: Org = {
  id: 'test-org-id',
  name: 'Test Org',
};

beforeAll(async () => {
  await testStore.init();
  await store.syncOrganizationsCache([org]);
});

afterAll(async () => {
  await testStore.cleanUp();
});

const fixturesPath = `${__dirname}/../test/fixtures`;

function readFixture(filename: string): Promise<string> {
  return readFile(join(fixturesPath, filename), 'utf8');
}

test('convert general election', async () => {
  const election = convertMsElection(
    'general-election-id',
    await readFixture('ms-sems-election-general-10.csv'),
    await readFixture('ms-sems-election-candidates-general-10.csv')
  );
  await store.createElection(org.id, election, 'VxDefaultBallot');
  expect(election).toMatchSnapshot();
});

test('convert primary election', async () => {
  const election = convertMsElection(
    'primary-election-id',
    await readFixture('ms-sems-election-primary-60.csv'),
    await readFixture('ms-sems-election-candidates-primary-60.csv')
  );
  expect(election).toMatchSnapshot();
  await store.createElection(org.id, election, 'VxDefaultBallot');
});
