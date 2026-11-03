import { assertDefined } from '@votingworks/basics';
import {
  electionGeneralFixtures,
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  createElectionDefinition,
  createElectionDefinitionCdf,
} from '@votingworks/test-utils';
import {
  DEFAULT_SYSTEM_SETTINGS,
  constructElectionKey,
  type BallotStyle,
  type ContestPosition,
  type Election,
  type ElectionDefinition,
  type SystemSettings,
} from '@votingworks/types';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { readElectionPackageFromFile } from './election_package_io.js';
import { ElectionPackageStore, type ElectionPackageImport } from './store.js';
import { importElectionPackageForTest } from '../test_utils.js';
import { createElectionPackageZipArchive } from './test_utils.js';

const baseElection = electionGeneralFixtures.readElection();
const contest = assertDefined(
  baseElection.contests.find((c) => c.type === 'candidate')
);
const candidate = assertDefined(contest.candidates[0]);
const contestPosition: ContestPosition = {
  bounds: { column: 0, height: 1, row: 3, width: 4 },
  contestId: contest.id,
  options: [],
};
const style1: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[0]),
  ballotPositions: [[[contestPosition], []]],
  orderedCandidatesByContest: {
    [contest.id]: [{ id: candidate.id, partyIds: candidate.partyIds }],
  },
};
const style2: BallotStyle = {
  ...assertDefined(baseElection.ballotStyles[1]),
  ballotPositions: undefined,
  orderedCandidatesByContest: undefined,
};
const election: Election = {
  ...baseElection,
  ballotStyles: [style1, style2],
};
const electionDefinition: ElectionDefinition =
  createElectionDefinition(election);
const jurisdiction = 'jurisdiction-1';

async function packageImport(
  systemSettings: SystemSettings = DEFAULT_SYSTEM_SETTINGS,
  options: Partial<ElectionPackageImport> = {}
): Promise<ElectionPackageImport> {
  const filePath = makeTemporaryFile({
    content: await createElectionPackageZipArchive({
      electionDefinition,
      systemSettings,
      uiStrings: { en: { hello: 'Hello' } },
      uiStringAudioIds: { en: { hello: ['clip-1'] } },
      uiStringAudioClips: [
        { id: 'clip-1', languageCode: 'en', dataBase64: 'AAAA' },
        { id: 'clip-2', languageCode: 'es', dataBase64: 'BBBB' },
      ],
      ballotPositions: systemSettings.splitElectionDefinition
        ? [
            {
              ballotStyleId: style2.id,
              positions: [[[], [contestPosition]]],
            },
          ]
        : undefined,
      candidateOrderings: systemSettings.splitElectionDefinition
        ? [
            {
              ballotStyleId: style2.id,
              orderings: { 'contest-2': [{ id: 'candidate-2' }] },
            },
          ]
        : undefined,
    }),
  });
  const { electionPackage, electionPackageHash } = (
    await readElectionPackageFromFile(filePath)
  ).unsafeUnwrap();
  return {
    electionPackage,
    electionPackageHash,
    filePath,
    jurisdiction,
    logger: mockBaseLogger({ fn: vi.fn }),
    ...options,
  };
}

test('empty store', () => {
  const store = ElectionPackageStore.memoryStore();
  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
  expect(store.getJurisdiction()).toBeUndefined();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('election key and jurisdiction', async () => {
  const store = ElectionPackageStore.memoryStore();
  const electionPackageHash = await importElectionPackageForTest(
    store,
    { electionDefinition },
    { jurisdiction, electionPackageHash: 'package-hash' }
  );

  expect(electionPackageHash).toEqual('package-hash');
  expect(store.hasElection()).toEqual(true);
  expect(store.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash: 'package-hash',
  });
  expect(store.getElectionKey()).toEqual(constructElectionKey(election));
  expect(store.getJurisdiction()).toEqual(jurisdiction);
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  store.reset();
  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionKey()).toBeUndefined();
});

test('system settings are cached until reset', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(dbPath);
  await importElectionPackageForTest(store, { electionDefinition });
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  ElectionPackageStore.fileStore(dbPath).reset();
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  store.reset();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('election key for a CDF election', async () => {
  const store = ElectionPackageStore.memoryStore();
  const cdfElectionDefinition = createElectionDefinitionCdf(baseElection);
  await importElectionPackageForTest(store, {
    electionDefinition: cdfElectionDefinition,
  });
  expect(store.getElectionKey()).toEqual(
    constructElectionKey(cdfElectionDefinition.election)
  );
});

test('importElectionPackage from a single-file election', async () => {
  const store = ElectionPackageStore.memoryStore();
  const { electionPackage, electionPackageHash, ...rest } =
    await packageImport();
  await store.importElectionPackage({
    electionPackage,
    electionPackageHash,
    ...rest,
  });

  expect(store.getElectionRecord()).toEqual({
    electionDefinition,
    electionPackageHash,
  });
  expect(store.getJurisdiction()).toEqual(jurisdiction);
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  const ballotMeta = store.getBallotMetaStore();
  expect(ballotMeta.getPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(ballotMeta.getPositions(style2.id)).toBeNull();
  expect(ballotMeta.getCandidateOrderings(style1.id)).toEqual(
    style1.orderedCandidatesByContest
  );

  const uiStrings = store.getUiStringsStore();
  expect(uiStrings.getLanguages()).toContain('en');
  expect(uiStrings.getUiStrings('en')).toMatchObject({ hello: 'Hello' });
  expect(uiStrings.getUiStringAudioIds('en')).toEqual({ hello: ['clip-1'] });
  expect(
    uiStrings.getAudioClips({ languageCode: 'en', audioIds: ['clip-1'] })
  ).toEqual([
    {
      id: 'clip-1',
      languageCode: 'en',
      dataBase64: 'data:audio/mp3;base64,AAAA',
    },
  ]);
  expect(
    uiStrings.getAudioClips({ languageCode: 'es', audioIds: ['clip-2'] })
  ).toEqual([]);
});

test('importElectionPackage from a split-file election', async () => {
  const store = ElectionPackageStore.memoryStore();
  await store.importElectionPackage(
    await packageImport({
      ...DEFAULT_SYSTEM_SETTINGS,
      splitElectionDefinition: true,
    })
  );

  const ballotMeta = store.getBallotMetaStore();
  expect(ballotMeta.getPositions(style1.id)).toBeNull();
  expect(ballotMeta.getPositions(style2.id)).toEqual([[[], [contestPosition]]]);
  expect(ballotMeta.getCandidateOrderings(style2.id)).toEqual({
    'contest-2': [{ id: 'candidate-2' }],
  });
});

test('importElectionPackage without UI strings', async () => {
  const store = ElectionPackageStore.memoryStore();
  await store.importElectionPackage(
    await packageImport(DEFAULT_SYSTEM_SETTINGS, { uiStrings: false })
  );

  expect(store.hasElection()).toEqual(true);
  expect(store.getUiStringsStore().getLanguages()).toEqual([]);
});

test('importElectionPackage rolls back on failure', async () => {
  const store = ElectionPackageStore.memoryStore();
  const packageToImport = await packageImport();
  await expect(
    store.importElectionPackage({
      ...packageToImport,
      filePath: '/nonexistent/election-package.zip',
    })
  ).rejects.toThrow();
  expect(store.hasElection()).toEqual(false);
});

test('fileStore builds the import beside the live database', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(
    dbPath,
    mockBaseLogger({ fn: vi.fn })
  );
  const packageToImport = await packageImport();

  await expect(
    store.importElectionPackage({
      ...packageToImport,
      filePath: '/nonexistent/election-package.zip',
    })
  ).rejects.toThrow();
  expect(store.hasElection()).toEqual(false);
  expect(existsSync(`${dbPath}.importing`)).toEqual(false);

  await store.importElectionPackage(packageToImport);
  await store.importElectionPackage({
    ...packageToImport,
    jurisdiction: 'jurisdiction-2',
  });
  expect(store.getJurisdiction()).toEqual('jurisdiction-2');
  expect(existsSync(`${dbPath}.importing`)).toEqual(false);
});

test('fileStore persists and reset empties it', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(
    dbPath,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(store.getDbPath()).toEqual(dbPath);
  await store.importElectionPackage(await packageImport());

  const reopened = ElectionPackageStore.fileStore(dbPath);
  expect(reopened.getElectionRecord()?.electionDefinition).toEqual(
    electionDefinition
  );
  expect(reopened.getBallotMetaStore().hasPositions()).toEqual(true);

  reopened.reset();
  expect(reopened.hasElection()).toEqual(false);
  expect(reopened.getSystemSettings()).toBeUndefined();
  expect(reopened.getBallotMetaStore().hasPositions()).toEqual(false);

  reopened.close();
  expect(() => reopened.hasElection()).toThrow(/is closed/);
});
