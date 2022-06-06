import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';

import { Store } from './store';

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toBe(':memory:');
});

test('add/get adjudications', () => {
  const store = Store.memoryStore();
  const id = store.addAdjudication('mayor', 'Mickey Mouse');
  const added = store.getAdjudicationById(id);
  expect(added?.id).toEqual(id);
  expect(added?.contestId).toEqual('mayor');
  expect(added?.transcribedValue).toEqual('Mickey Mouse');
});
