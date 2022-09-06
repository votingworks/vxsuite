import { Admin } from '@votingworks/api';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { MemoryStorage, typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import {
  activeElectionIdStorageKey,
  ElectionManagerStoreAdminBackend,
} from './admin_backend';

const getElectionsResponse: Admin.GetElectionsResponse = [
  {
    id: 'test-election-1',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    createdAt: '2021-01-01T00:00:00.000Z',
    updatedAt: '2021-01-01T00:00:00.000Z',
  },
  {
    id: 'test-election-2',
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    createdAt: '2022-01-01T00:00:00.000Z',
    updatedAt: '2022-01-01T00:00:00.000Z',
  },
];

test('load election without an active election ID', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  fetchMock.reset().get('/admin/elections', {
    body: getElectionsResponse,
  });

  await expect(
    backend.loadElectionDefinitionAndConfiguredAt()
  ).resolves.toBeUndefined();
});

test('load election with an active election ID', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(activeElectionIdStorageKey, 'test-election-2');
  fetchMock.reset().get('/admin/elections', {
    body: getElectionsResponse,
  });

  await expect(
    backend.loadElectionDefinitionAndConfiguredAt()
  ).resolves.toStrictEqual({
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    configuredAt: '2022-01-01T00:00:00.000Z',
  });
});

test('load election HTTP error', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(activeElectionIdStorageKey, 'test-election-1');
  fetchMock.reset().get('/admin/elections', 500);

  await expect(
    backend.loadElectionDefinitionAndConfiguredAt()
  ).rejects.toThrowError();
});

test('load election invalid response', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(activeElectionIdStorageKey, 'test-election-1');
  fetchMock.reset().get('/admin/elections', [{ invalid: 'response' }]);

  await expect(
    backend.loadElectionDefinitionAndConfiguredAt()
  ).rejects.toThrowError();
});

test('configure with invalid election definition', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });
  await expect(backend.configure('')).rejects.toThrowError();
});

test('configure HTTP error', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  fetchMock.reset().post('/admin/elections', 500);

  await expect(
    backend.configure(electionWithMsEitherNeitherDefinition.electionData)
  ).rejects.toThrowError();
});

test('configure invalid response', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  fetchMock.reset().post('/admin/elections', { invalid: 'response' });

  await expect(
    backend.configure(electionWithMsEitherNeitherDefinition.electionData)
  ).rejects.toThrowError();
});

test('configure errors response', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  fetchMock.reset().post('/admin/elections', {
    body: typedAs<Admin.PostElectionResponse>({
      status: 'error',
      errors: [
        { type: 'invalid', message: 'invalid election' },
        { type: 'another', message: 'I do not like you' },
      ],
    }),
  });

  await expect(
    backend.configure(electionWithMsEitherNeitherDefinition.electionData)
  ).rejects.toThrowError('invalid election, I do not like you');
});
