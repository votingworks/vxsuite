import { Admin } from '@votingworks/api';
import { electionWithMsEitherNeitherDefinition } from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { MemoryStorage, typedAs } from '@votingworks/utils';
import { isOfficialResultsKey } from '../../hooks/use_election_manager_store';
import { ElectionManagerStoreStorageBackend } from './storage_backend';

test('marking results as official', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  const backend = new ElectionManagerStoreStorageBackend({
    storage,
    logger,
  });

  await backend.configure(electionWithMsEitherNeitherDefinition.electionData);
  expect(await storage.get(isOfficialResultsKey)).toBeUndefined();
  await backend.markResultsOfficial();
  expect(await storage.get(isOfficialResultsKey)).toBe(true);
  expect(await backend.loadCurrentElectionMetadata()).toEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        isOfficialResults: true,
      })
    )
  );
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
