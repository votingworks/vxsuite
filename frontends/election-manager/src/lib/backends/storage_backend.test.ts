import { fakeLogger } from '@votingworks/logging';
import { MemoryStorage } from '@votingworks/utils';
import { isOfficialResultsKey } from '../../hooks/use_election_manager_store';
import { ElectionManagerStoreStorageBackend } from './storage_backend';

test('marking results as official', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  const backend = new ElectionManagerStoreStorageBackend({
    storage,
    logger,
  });

  expect(await storage.get(isOfficialResultsKey)).toBeUndefined();
  await backend.markResultsOfficial();
  expect(await storage.get(isOfficialResultsKey)).toBe(true);
  expect(await backend.loadIsOfficialResults()).toBe(true);
});

test('reset', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  const backend = new ElectionManagerStoreStorageBackend({
    storage,
    logger,
  });

  jest.spyOn(storage, 'clear');
  await backend.reset();
  expect(storage.clear).toHaveBeenCalled();
});
