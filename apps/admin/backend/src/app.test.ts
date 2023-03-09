import { Admin } from '@votingworks/api';
import { assert } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleFixtures,
  electionSampleCdfDefinition,
} from '@votingworks/fixtures';
import { LogEventId } from '@votingworks/logging';
import { promises as fs } from 'fs';
import { sha256 } from 'js-sha256';
import { tmpdir } from 'os';
import { join, sep } from 'path';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
} from '../test/app';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('managing the current election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);

  // try configuring with malformed election data
  const badConfigureResult = await apiClient.configure({ electionData: '{}' });
  assert(badConfigureResult.isErr());
  expect(badConfigureResult.err().type).toEqual('parsing');

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { electionData, electionHash } = electionDefinition;

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  const { electionId } = configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    id: electionId,
    electionDefinition,
  });

  // mark results as official as election manager
  mockElectionManagerAuth(auth, electionHash);
  await apiClient.markResultsOfficial();
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.MarkedTallyResultsOfficial,
    'election_manager',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: true,
    id: electionId,
    electionDefinition,
  });

  // unconfigure as system administrator
  mockSystemAdministratorAuth(auth);
  await apiClient.unconfigure();
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.ElectionUnconfigured,
    'system_administrator',
    expect.objectContaining({
      disposition: 'success',
    })
  );
  expect(await apiClient.getCurrentElectionMetadata()).toBeNull();

  // confirm we can reconfigure on same app instance
  void (await apiClient.configure({
    electionData,
  }));
  expect(await apiClient.getCurrentElectionMetadata()).toMatchObject({
    isOfficialResults: false,
    electionDefinition,
  });
});

test('configuring with a CDF election', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  mockSystemAdministratorAuth(auth);

  const { electionData, electionHash } = electionSampleCdfDefinition;

  // configure with well-formed election data
  const configureResult = await apiClient.configure({
    electionData,
  });
  assert(configureResult.isOk());
  configureResult.ok();
  expect(logger.log).toHaveBeenNthCalledWith(
    1,
    LogEventId.ElectionConfigured,
    'system_administrator',
    {
      disposition: 'success',
      newElectionHash: electionHash,
    }
  );

  const currentElectionMetadata = await apiClient.getCurrentElectionMetadata();
  expect(currentElectionMetadata?.electionDefinition.electionData).toEqual(
    electionData
  );
  expect(currentElectionMetadata?.electionDefinition.electionHash).toEqual(
    electionHash
  );
});

test('cast vote records - happy path election flow', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, standardCvrFile, standardLiveCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files or cast vote records
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Unlocked
  );

  // add a file, with a filename that is not parse-able
  const cvrTestFilePath = standardCvrFile.asFilePath();
  const cvrFileLastModified1 = (
    await fs.stat(cvrTestFilePath)
  ).mtime.toISOString();
  const addTestFileResult = await apiClient.addCastVoteRecordFile({
    path: cvrTestFilePath,
  });
  assert(addTestFileResult.isOk());
  expect(addTestFileResult.ok()).toMatchObject({
    wasExistingFile: false,
    exportedTimestamp: cvrFileLastModified1,
    alreadyPresent: 0,
    newlyAdded: 3000,
    scannerIds: ['scanner-1', 'scanner-2'],
    fileMode: 'test',
    fileName: 'standard.jsonl',
  });

  // should now be able to retrieve the file
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([
    expect.objectContaining({
      exportTimestamp: cvrFileLastModified1,
      filename: 'standard.jsonl',
      numCvrsImported: 3000,
      precinctIds: ['precinct-1', 'precinct-2'],
      scannerIds: ['scanner-1', 'scanner-2'],
      sha256Hash: sha256(standardCvrFile.asText()),
    }),
  ]);

  // check cast vote record count and a single record
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(await apiClient.getCastVoteRecords()).toMatchObject(
    expect.arrayContaining([
      {
        _ballotId: 'id-0',
        _ballotType: 'absentee',
        _precinctId: 'precinct-1',
        _ballotStyleId: '1M',
        _testBallot: true,
        _scannerId: 'scanner-1',
        'best-animal-mammal': [],
        'zoo-council-mammal': [],
        'new-zoo-either': ['yes'],
        'new-zoo-pick': ['yes'],
      },
    ])
  );

  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Test
  );

  // remove CVR files, expect clear state
  await apiClient.clearCastVoteRecordFiles();
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(0);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Unlocked
  );

  // now try loading official CVR files, as if after L&A
  const cvrLiveFilePath = standardLiveCvrFile.asFilePath();
  const addLiveFileResult = await apiClient.addCastVoteRecordFile({
    path: cvrLiveFilePath,
  });
  assert(addLiveFileResult.isOk());
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(await apiClient.getCastVoteRecordFileMode()).toEqual(
    Admin.CvrFileMode.Official
  );
});

test('addCastVoteRecordFile - handle duplicate file', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // initially, no files
  expect(await apiClient.getCastVoteRecordFiles()).toEqual([]);

  // add a file, with a filename that is not parse-able
  const cvrFilePath = standardCvrFile.asFilePath();
  const addStandardFileResult = await apiClient.addCastVoteRecordFile({
    path: cvrFilePath,
  });
  assert(addStandardFileResult.isOk());
  expect(logger.log).toHaveBeenNthCalledWith(
    2,
    LogEventId.CvrLoaded,
    'election_manager',
    {
      disposition: 'success',
      filename: 'standard.jsonl',
      message: expect.anything(),
      numberOfBallotsImported: 3000,
      duplicateBallotsIgnored: 0,
    }
  );

  // try adding duplicate file
  const addDuplicateFileResult = await apiClient.addCastVoteRecordFile({
    path: cvrFilePath,
  });
  assert(addDuplicateFileResult.isOk());
  expect(addDuplicateFileResult.ok()).toMatchObject({
    wasExistingFile: true,
    alreadyPresent: 3000,
    newlyAdded: 0,
    fileMode: 'test',
    fileName: 'standard.jsonl',
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);
  expect(logger.log).toHaveBeenNthCalledWith(
    3,
    LogEventId.CvrLoaded,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      filename: 'standard.jsonl',
    })
  );
});

test('addCastVoteRecordFile - handle file with previously added entries', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // add normal file
  const cvrFilePath1 = standardCvrFile.asFilePath();
  const addStandardFileResult = await apiClient.addCastVoteRecordFile({
    path: cvrFilePath1,
  });
  assert(addStandardFileResult.isOk());
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(1);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3000);

  // create file that is duplicate but with one new entry
  const standardEntries = standardCvrFile.asText().split('\n');
  const newEntry = standardEntries[0]!.replace('id-0', 'id-3000');

  // test ability to parse expected filename format here also
  const duplicateEntryFileName =
    'TEST__machine_000__20_ballots__2022-07-01_11-21-41.jsonl';
  const duplicateEntryFilePath = join(
    await fs.mkdtemp(tmpdir() + sep),
    duplicateEntryFileName
  );
  await fs.writeFile(
    duplicateEntryFilePath,
    `${standardCvrFile.asText()}\n${newEntry}`
  );
  const addDuplicateEntriesResult = await apiClient.addCastVoteRecordFile({
    path: duplicateEntryFilePath,
  });
  assert(addDuplicateEntriesResult.isOk());
  expect(addDuplicateEntriesResult.ok()).toMatchObject({
    wasExistingFile: false,
    newlyAdded: 1,
    alreadyPresent: 3000,
    exportedTimestamp: '2022-07-01T11:21:41.000Z',
    fileMode: 'test',
    fileName: duplicateEntryFileName,
  });
  expect(await apiClient.getCastVoteRecordFiles()).toHaveLength(2);
  expect(await apiClient.getCastVoteRecords()).toHaveLength(3001);
});

test('addCastVoteRecordfile - handle invalid path', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const addInvalidFileResult = await apiClient.addCastVoteRecordFile({
    path: '/tmp/does-not-exist',
  });
  expect(addInvalidFileResult.err()).toMatchObject({
    type: 'invalid-file',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
      filename: 'does-not-exist',
    })
  );
});

// currently the app will crash if the passed file is not NDJSON
// when we import a new cast vote record format, avoid crashing
test('addCastVoteRecordFile - handle parsing error', async () => {
  const { apiClient, auth, logger } = buildTestEnvironment();

  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const badFileName =
    'TEST__machine_000__20_ballots__2022-07-01_11-21-41.jsonl';
  const badFilePath = join(await fs.mkdtemp(tmpdir() + sep), badFileName);
  await fs.writeFile(badFilePath, '{}');
  const addBadFileResult = await apiClient.addCastVoteRecordFile({
    path: badFilePath,
  });
  expect(addBadFileResult.err()).toMatchObject({
    type: 'invalid-record',
  });
  expect(logger.log).toHaveBeenLastCalledWith(
    LogEventId.CvrLoaded,
    'election_manager',
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('auth', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const { electionData, electionHash } = electionDefinition;
  const { apiClient, auth, workspace } = buildTestEnvironment();
  workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  workspace.store.addElection(
    electionFamousNames2021Fixtures.electionDefinition.electionData
  );

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();
  void (await apiClient.programCard({ userRole: 'system_administrator' }));
  void (await apiClient.programCard({ userRole: 'election_manager' }));
  void (await apiClient.unprogramCard());

  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, { electionHash });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { pin: '123456' }
  );
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, { electionHash });
  expect(auth.programCard).toHaveBeenCalledTimes(2);
  expect(auth.programCard).toHaveBeenNthCalledWith(
    1,
    { electionHash },
    { userRole: 'system_administrator' }
  );
  expect(auth.programCard).toHaveBeenNthCalledWith(
    2,
    { electionHash },
    { userRole: 'election_manager', electionData }
  );
  expect(auth.unprogramCard).toHaveBeenCalledTimes(1);
  expect(auth.unprogramCard).toHaveBeenNthCalledWith(1, { electionHash });
});

test('auth before election definition has been configured', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  await apiClient.getAuthStatus();
  await apiClient.checkPin({ pin: '123456' });
  await apiClient.logOut();

  expect(auth.getAuthStatus).toHaveBeenCalledTimes(1);
  expect(auth.getAuthStatus).toHaveBeenNthCalledWith(1, {
    electionHash: undefined,
  });
  expect(auth.checkPin).toHaveBeenCalledTimes(1);
  expect(auth.checkPin).toHaveBeenNthCalledWith(
    1,
    { electionHash: undefined },
    { pin: '123456' }
  );
  expect(auth.logOut).toHaveBeenCalledTimes(1);
  expect(auth.logOut).toHaveBeenNthCalledWith(1, {
    electionHash: undefined,
  });
});
