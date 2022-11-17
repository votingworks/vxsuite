import { Admin } from '@votingworks/api';
import {
  electionMinimalExhaustiveSampleDefinition,
  electionMinimalExhaustiveSampleFixtures,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { assert, MemoryStorage, typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import moment from 'moment';
import {
  currentElectionIdStorageKey,
  ElectionManagerStoreAdminBackend,
} from './admin_backend';

const getElectionsResponse: Admin.GetElectionsResponse = [
  {
    id: 'test-election-1',
    electionDefinition: electionWithMsEitherNeitherDefinition,
    createdAt: '2021-01-01T00:00:00.000Z',
    isOfficialResults: false,
  },
  {
    id: 'test-election-2',
    electionDefinition: electionMinimalExhaustiveSampleDefinition,
    createdAt: '2022-01-01T00:00:00.000Z',
    isOfficialResults: false,
  },
];

beforeEach(() => {
  fetchMock.reset();
});

test('load election without a current election ID', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  fetchMock.reset().get('/admin/elections', {
    body: getElectionsResponse,
  });

  await expect(backend.loadCurrentElectionMetadata()).resolves.toBeUndefined();
});

test('load election with a current election ID', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.reset().get('/admin/elections', {
    body: getElectionsResponse,
  });

  await expect(backend.loadCurrentElectionMetadata()).resolves.toStrictEqual(
    expect.objectContaining(
      typedAs<Partial<Admin.ElectionRecord>>({
        electionDefinition: electionMinimalExhaustiveSampleDefinition,
        createdAt: '2022-01-01T00:00:00.000Z',
      })
    )
  );
});

test('load election HTTP error', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-1');
  fetchMock.reset().get('/admin/elections', 500);

  await expect(backend.loadCurrentElectionMetadata()).rejects.toThrowError();
});

test('load election invalid response', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-1');
  fetchMock.reset().get('/admin/elections', [{ invalid: 'response' }]);

  await expect(backend.loadCurrentElectionMetadata()).rejects.toThrowError();
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

test('getCvrFiles happy path', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.get('/admin/elections', getElectionsResponse);

  const getCvrFilesResponse: Admin.GetCvrFilesResponse = [
    {
      id: 'cvr-file-2',
      createdAt: new Date().toISOString(),
      electionId: 'test-election-2',
      exportTimestamp: new Date().toISOString(),
      filename: 'cvr-file-2.jsonl',
      numCvrsImported: 20,
      precinctIds: ['precinct-2'],
      scannerIds: ['scanner-4', 'scanner-6'],
      sha256Hash: 'file-2-hash',
    },
    {
      id: 'cvr-file-1',
      createdAt: new Date().toISOString(),
      electionId: 'test-election-2',
      exportTimestamp: new Date().toISOString(),
      filename: 'cvr-file-1.jsonl',
      numCvrsImported: 101,
      precinctIds: ['precinct-1', 'precinct-2'],
      scannerIds: ['scanner-1', 'scanner-2'],
      sha256Hash: 'file-1-hash',
    },
  ];

  fetchMock.get(
    '/admin/elections/test-election-2/cvr-files',
    getCvrFilesResponse
  );

  await expect(backend.getCvrFiles()).resolves.toEqual<
    Admin.CastVoteRecordFileRecord[]
  >(getCvrFilesResponse);
});

test('getCvrFiles throws on fetch error', async () => {
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.get('/admin/elections', getElectionsResponse);

  fetchMock.get('/admin/elections/test-election-2/cvr-files', { status: 500 });

  await expect(backend.getCvrFiles()).rejects.toThrowError();
});

test('addCastVoteRecordFile happy path', async () => {
  const { partial1CvrFile } = electionMinimalExhaustiveSampleFixtures;
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.get('/admin/elections', { body: getElectionsResponse });

  const exportedTimestamp = '2021-09-02T22:27:58.327Z';
  const apiResponse: Admin.PostCvrFileResponse = {
    status: 'ok',
    id: 'cvr-file-1',
    alreadyPresent: 10,
    exportedTimestamp,
    fileMode: Admin.CvrFileMode.Test,
    fileName: 'cvrs.jsonl',
    newlyAdded: 450,
    scannerIds: ['scanner-4', 'scanner-6'],
    wasExistingFile: false,
  };
  fetchMock.post(
    '/admin/elections/test-election-2/cvr-files?',
    (_url, mockRequest) => {
      assert(mockRequest.body instanceof FormData);

      const formData: FormData = mockRequest.body;
      expect(formData.get('exportedTimestamp')).toBe(exportedTimestamp);

      return apiResponse;
    }
  );

  await expect(backend.loadCastVoteRecordFiles()).resolves.toBeUndefined();

  await expect(
    backend.addCastVoteRecordFile(
      new File([partial1CvrFile.asBuffer()], 'cvrs.jsonl', {
        lastModified: new Date(exportedTimestamp).valueOf(),
      })
    )
  ).resolves.toEqual<Admin.CvrFileImportInfo>({
    alreadyPresent: 10,
    exportedTimestamp,
    fileMode: Admin.CvrFileMode.Test,
    fileName: 'cvrs.jsonl',
    id: 'cvr-file-1',
    newlyAdded: 450,
    scannerIds: ['scanner-4', 'scanner-6'],
    wasExistingFile: false,
  });

  const cvrFilesFromStorage = await backend.loadCastVoteRecordFiles();
  expect(cvrFilesFromStorage).not.toBeUndefined();
  expect(cvrFilesFromStorage?.fileList.length).toBeGreaterThan(0);
});

test('addCastVoteRecordFile prioritizes export timestamp in filename', async () => {
  const { partial1CvrFile } = electionMinimalExhaustiveSampleFixtures;
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.get('/admin/elections', { body: getElectionsResponse });

  const timestampFromFileInfo = '2022-01-01T00:00:00.000Z';
  const timestampFromFilename = '2021-09-12_08-11-25';
  const vxFormattedFilename = `TEST__machine_0000__1_ballots__${timestampFromFilename}`;
  const timestampFromFilenameIsoString = moment(
    timestampFromFilename,
    'YYYY-MM-DD_HH-mm-ss'
  )
    .toDate()
    .toISOString();

  const apiResponse: Admin.PostCvrFileResponse = {
    status: 'ok',
    id: 'cvr-file-1',
    alreadyPresent: 10,
    exportedTimestamp: timestampFromFilenameIsoString,
    fileMode: Admin.CvrFileMode.Test,
    fileName: vxFormattedFilename,
    newlyAdded: 450,
    scannerIds: ['scanner-4', 'scanner-6'],
    wasExistingFile: false,
  };
  fetchMock.post(
    '/admin/elections/test-election-2/cvr-files?',
    (_url, mockRequest) => {
      assert(mockRequest.body instanceof FormData);

      const formData: FormData = mockRequest.body;
      expect(formData.get('exportedTimestamp')).toBe(
        timestampFromFilenameIsoString
      );

      return apiResponse;
    }
  );

  await expect(
    backend.addCastVoteRecordFile(
      new File([partial1CvrFile.asBuffer()], vxFormattedFilename, {
        lastModified: new Date(timestampFromFileInfo).valueOf(),
      })
    )
  ).resolves.toEqual<Admin.CvrFileImportInfo>({
    alreadyPresent: 10,
    exportedTimestamp: timestampFromFilenameIsoString,
    fileMode: Admin.CvrFileMode.Test,
    fileName: vxFormattedFilename,
    id: 'cvr-file-1',
    newlyAdded: 450,
    scannerIds: ['scanner-4', 'scanner-6'],
    wasExistingFile: false,
  });

  const cvrFilesFromStorage = await backend.loadCastVoteRecordFiles();
  expect(cvrFilesFromStorage).not.toBeUndefined();
  expect(cvrFilesFromStorage?.fileList.length).toBeGreaterThan(0);
});

test('addCastVoteRecordFile analyze only', async () => {
  const { partial1CvrFile } = electionMinimalExhaustiveSampleFixtures;
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');

  const exportedTimestamp = '2021-09-02T22:27:58.327Z';
  const apiResponse: Admin.PostCvrFileResponse = {
    status: 'ok',
    id: 'cvr-file-1',
    alreadyPresent: 10,
    exportedTimestamp,
    fileMode: Admin.CvrFileMode.Test,
    fileName: 'cvrs.jsonl',
    newlyAdded: 450,
    scannerIds: ['scanner-2', 'scanner-3'],
    wasExistingFile: false,
  };
  fetchMock.post(
    `/admin/elections/test-election-2/cvr-files?analyzeOnly=true`,
    apiResponse
  );

  await expect(backend.loadCastVoteRecordFiles()).resolves.toBeUndefined();

  await expect(
    backend.addCastVoteRecordFile(
      new File([partial1CvrFile.asBuffer()], 'cvrs.jsonl'),
      { analyzeOnly: true }
    )
  ).resolves.toEqual<Admin.CvrFileImportInfo>({
    alreadyPresent: 10,
    exportedTimestamp,
    fileMode: Admin.CvrFileMode.Test,
    fileName: 'cvrs.jsonl',
    id: 'cvr-file-1',
    newlyAdded: 450,
    scannerIds: ['scanner-2', 'scanner-3'],
    wasExistingFile: false,
  });

  await expect(backend.loadCastVoteRecordFiles()).resolves.toBeUndefined();
});

test('addCastVoteRecordFile handles api errors', async () => {
  const { partial1CvrFile } = electionMinimalExhaustiveSampleFixtures;
  const storage = new MemoryStorage();
  const logger = fakeLogger();
  const backend = new ElectionManagerStoreAdminBackend({ storage, logger });

  await storage.set(currentElectionIdStorageKey, 'test-election-2');
  fetchMock.get('/admin/elections', { body: getElectionsResponse });

  await storage.set(currentElectionIdStorageKey, 'test-election-id');

  const apiError: Admin.PostCvrFileResponse = {
    status: 'error',
    errors: [{ type: 'oops', message: 'that was unexpected' }],
  };
  fetchMock.post(`/admin/elections/test-election-id/cvr-files?`, apiError);

  await expect(
    backend.addCastVoteRecordFile(
      new File([partial1CvrFile.asBuffer()], 'cvrs.jsonl')
    )
  ).rejects.toThrow(/that was unexpected/);
});
