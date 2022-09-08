import { Admin } from '@votingworks/api';
import {
  electionFamousNames2021Fixtures,
  electionWithMsEitherNeitherFixtures,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import {
  ExternalTallySourceType,
  safeParseJson,
  VotingMethod,
} from '@votingworks/types';
import { MemoryStorage, typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import { eitherNeitherElectionDefinition } from '../../../test/render_in_app_context';
import { PrintedBallot } from '../../config/types';
import { convertTalliesByPrecinctToFullExternalTally } from '../../utils/external_tallies';
import { ElectionManagerStoreAdminBackend } from './admin_backend';
import { ElectionManagerStoreMemoryBackend } from './memory_backend';
import { ElectionManagerStoreStorageBackend } from './storage_backend';

function makeStorageBackend(): ElectionManagerStoreStorageBackend {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  // disallow network access for storage-based backend
  fetchMock.reset().mock('*', (url) => {
    throw new Error(`Unexpected fetch: ${url}`);
  });

  return new ElectionManagerStoreStorageBackend({
    storage,
    logger,
  });
}

function makeMemoryBackend(): ElectionManagerStoreMemoryBackend {
  // disallow network access for in-memory backend
  fetchMock.reset().mock('*', (url) => {
    throw new Error(`Unexpected fetch: ${url}`);
  });

  return new ElectionManagerStoreMemoryBackend();
}

function makeAdminBackend(): ElectionManagerStoreAdminBackend {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  let nextElectionIndex = 1;
  let elections: Admin.ElectionRecord[] = [];
  fetchMock
    .reset()
    .get('/admin/elections', () => ({
      body: typedAs<Admin.GetElectionsResponse>(elections),
    }))
    .post('/admin/elections', (url, request) => {
      const id = `test-election-${nextElectionIndex}`;
      nextElectionIndex += 1;
      elections.push({
        id,
        electionDefinition: safeParseJson(
          request.body as string,
          Admin.PostElectionRequestSchema
        ).unsafeUnwrap(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {
        body: typedAs<Admin.PostElectionResponse>({ status: 'ok', id }),
      };
    })
    .delete('glob:/admin/elections/*', (url) => {
      const match = url.match(/\/admin\/elections\/(.+)/);
      elections = elections.filter((e) => e.id !== match?.[1]);
      return { body: typedAs<Admin.DeleteElectionResponse>({ status: 'ok' }) };
    });

  return new ElectionManagerStoreAdminBackend({
    storage,
    logger,
  });
}

describe.each([
  ['storage', makeStorageBackend],
  ['memory', makeMemoryBackend],
  ['admin', makeAdminBackend],
])('%s backend', (_backendName, makeBackend) => {
  test('configure', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    expect(await backend.loadElectionDefinitionAndConfiguredAt()).toStrictEqual(
      {
        electionDefinition: electionFamousNames2021Fixtures.electionDefinition,
        configuredAt: expect.any(String),
      }
    );
  });

  test('add printed ballot', async () => {
    const backend = makeBackend();
    const printedBallot: PrintedBallot = {
      type: 'standard',
      ballotStyleId: '1',
      precinctId: '1',
      locales: { primary: 'en_US' },
      numCopies: 1,
      printedAt: new Date().toISOString(),
    };

    expect(await backend.loadPrintedBallots()).toBeUndefined();
    await backend.addPrintedBallot(printedBallot);
    expect(await backend.loadPrintedBallots()).toStrictEqual([printedBallot]);
  });

  test('reset', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    await backend.markResultsOfficial();
    await backend.reset();
    expect(
      await backend.loadElectionDefinitionAndConfiguredAt()
    ).toBeUndefined();
    expect(await backend.loadIsOfficialResults()).toBeUndefined();
  });

  test('marking results as official', async () => {
    const backend = makeBackend();
    await backend.markResultsOfficial();
    expect(await backend.loadIsOfficialResults()).toBe(true);
  });

  test('clearing cast vote record files', async () => {
    const backend = makeBackend();
    await backend.configure(eitherNeitherElectionDefinition.electionData);
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
    await backend.addCastVoteRecordFile(
      new File([electionWithMsEitherNeitherFixtures.cvrData], 'cvrs.txt')
    );
    expect((await backend.loadCastVoteRecordFiles())?.fileList).toHaveLength(1);
    await backend.clearCastVoteRecordFiles();
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
  });

  test('full election tallies', async () => {
    const backend = makeBackend();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());
    const manualTally = convertTalliesByPrecinctToFullExternalTally(
      { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
      electionWithMsEitherNeitherFixtures.election,
      VotingMethod.Absentee,
      ExternalTallySourceType.Manual,
      'Manually Added Data',
      new Date()
    );

    await backend.updateFullElectionExternalTally(
      ExternalTallySourceType.Manual,
      manualTally
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([manualTally]);

    await backend.removeFullElectionExternalTally(
      ExternalTallySourceType.Manual
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([]);

    await backend.updateFullElectionExternalTally(
      ExternalTallySourceType.Manual,
      manualTally
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([manualTally]);

    await backend.clearFullElectionExternalTallies();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());

    await backend.reset();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());
  });
});
