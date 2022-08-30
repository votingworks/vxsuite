import {
  electionFamousNames2021Fixtures,
  electionWithMsEitherNeitherFixtures,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import { ExternalTallySourceType, VotingMethod } from '@votingworks/types';
import { MemoryStorage } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import { eitherNeitherElectionDefinition } from '../../../test/render_in_app_context';
import { PrintedBallot } from '../../config/types';
import { CastVoteRecordFiles } from '../../utils/cast_vote_record_files';
import { convertTalliesByPrecinctToFullExternalTally } from '../../utils/external_tallies';
import { ElectionManagerStoreMemoryBackend } from './memory_backend';
import { ElectionManagerStoreStorageBackend } from './storage_backend';

function makeStorageBackend(): ElectionManagerStoreStorageBackend {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  return new ElectionManagerStoreStorageBackend({
    storage,
    logger,
  });
}

function makeMemoryBackend(): ElectionManagerStoreMemoryBackend {
  return new ElectionManagerStoreMemoryBackend();
}

describe.each([
  ['storage', makeStorageBackend],
  ['memory', makeMemoryBackend],
])('%s backend', (_backendName, makeBackend) => {
  beforeEach(() => {
    fetchMock.reset().mock('*', (url) => {
      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

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
    await backend.setCastVoteRecordFiles(
      await CastVoteRecordFiles.empty.add(
        new File([electionWithMsEitherNeitherFixtures.cvrData], 'cvrs.txt'),
        electionWithMsEitherNeitherFixtures.election
      )
    );
    expect((await backend.loadCastVoteRecordFiles())?.fileList).toHaveLength(1);
    await backend.clearCastVoteRecordFiles();
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
  });

  test('full election tallies', async () => {
    const backend = makeBackend();
    expect(await backend.loadFullElectionExternalTallies()).toBeUndefined();
    const manualTally = convertTalliesByPrecinctToFullExternalTally(
      { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
      electionWithMsEitherNeitherFixtures.election,
      VotingMethod.Absentee,
      ExternalTallySourceType.Manual,
      'Manually Added Data',
      new Date()
    );

    await backend.addFullElectionExternalTally(manualTally);
    expect(await backend.loadFullElectionExternalTallies()).toStrictEqual([
      manualTally,
    ]);

    await backend.addFullElectionExternalTally(manualTally);
    expect(await backend.loadFullElectionExternalTallies()).toStrictEqual([
      manualTally,
      manualTally,
    ]);

    await backend.setFullElectionExternalTallies([manualTally]);
    expect(await backend.loadFullElectionExternalTallies()).toStrictEqual([
      manualTally,
    ]);

    await backend.reset();
    expect(await backend.loadFullElectionExternalTallies()).toBeUndefined();
  });
});
