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
  type EncodedBallotEntry,
  type SystemSettings,
} from '@votingworks/types';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { readElectionPackageFromFile } from './election_package_io.js';
import {
  ElectionPackageStore,
  type ElectionPackageImport,
  type ElectionPackageInclude,
} from './store.js';
import type { EncodedBallotKey } from './encoded_ballot_store.js';
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
const INCLUDE_ALL = {
  uiStrings: true,
  ballots: true,
  ballotPositions: true,
  candidateOrderings: true,
} as const satisfies ElectionPackageInclude;

/** Builds a file store that imports only `include`. */
function partialFileStore(
  include: ElectionPackageInclude
): ElectionPackageStore {
  return ElectionPackageStore.fileStore(
    join(makeTemporaryDirectory(), 'election-package.db'),
    include
  );
}

/** Opens `store`'s database to inspect every part of it. */
function reopenWithEverything(
  store: ElectionPackageStore
): ElectionPackageStore<typeof INCLUDE_ALL> {
  return ElectionPackageStore.fileStore(store.getDbPath(), INCLUDE_ALL);
}

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
              ballotStyleGroupId: style2.groupId,
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
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
  expect(store.hasElection()).toEqual(false);
  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.getElectionKey()).toBeUndefined();
  expect(store.getJurisdiction()).toBeUndefined();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('election key and jurisdiction', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
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
  const store = ElectionPackageStore.fileStore(dbPath, INCLUDE_ALL);
  await importElectionPackageForTest(store, { electionDefinition });
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  ElectionPackageStore.fileStore(dbPath, INCLUDE_ALL).reset();
  expect(store.getSystemSettings()).toEqual(DEFAULT_SYSTEM_SETTINGS);

  store.reset();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('election key for a CDF election', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
  const cdfElectionDefinition = createElectionDefinitionCdf(baseElection);
  await importElectionPackageForTest(store, {
    electionDefinition: cdfElectionDefinition,
  });
  expect(store.getElectionKey()).toEqual(
    constructElectionKey(cdfElectionDefinition.election)
  );
});

test('only included parts have store getters', () => {
  const store = ElectionPackageStore.memoryStore({
    uiStrings: false,
    ballots: false,
    ballotPositions: false,
    candidateOrderings: false,
  });
  // @ts-expect-error UI strings aren't included
  store.getUiStringsStore();
  // @ts-expect-error ballot PDFs aren't included
  store.getEncodedBallotStore();
  // @ts-expect-error ballot positions aren't included
  store.getBallotPositionsStore();
  // @ts-expect-error candidate orderings aren't included
  store.getCandidateOrderingsStore();
});

test('importElectionPackage from a single-file election', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
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

  const positions = store.getBallotPositionsStore();
  expect(positions.getPositions(style1.id)).toEqual(style1.ballotPositions);
  expect(positions.getPositions(style2.id)).toBeNull();
  expect(
    store.getCandidateOrderingsStore().getCandidateOrderings(style1)
  ).toEqual(style1.orderedCandidatesByContest);

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
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
  await store.importElectionPackage(
    await packageImport({
      ...DEFAULT_SYSTEM_SETTINGS,
      splitElectionDefinition: true,
    })
  );

  const positions = store.getBallotPositionsStore();
  expect(positions.getPositions(style1.id)).toBeNull();
  expect(positions.getPositions(style2.id)).toEqual([[[], [contestPosition]]]);
  expect(
    store.getCandidateOrderingsStore().getCandidateOrderings(style2)
  ).toEqual({
    'contest-2': [{ id: 'candidate-2' }],
  });
});

test('importElectionPackage without UI strings', async () => {
  const store = partialFileStore({ ...INCLUDE_ALL, uiStrings: false });
  await store.importElectionPackage(await packageImport());

  expect(store.hasElection()).toEqual(true);
  expect(
    reopenWithEverything(store).getUiStringsStore().getLanguages()
  ).toEqual([]);
});

test('importElectionPackage without ballot positions or candidate orderings', async () => {
  const store = partialFileStore({
    ...INCLUDE_ALL,
    ballotPositions: false,
    candidateOrderings: false,
  });
  await store.importElectionPackage(await packageImport());

  const reopened = reopenWithEverything(store);
  expect(store.hasElection()).toEqual(true);
  expect(reopened.getBallotPositionsStore().hasPositions()).toEqual(false);
  expect(
    reopened.getCandidateOrderingsStore().getCandidateOrderings(style1)
  ).toBeNull();
});

test('importElectionPackage with ballots', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
  const precinctId = assertDefined(election.precincts[0]).id;
  const officialPrecinct: EncodedBallotEntry = {
    ballotStyleId: style1.id,
    precinctId,
    ballotType: 'precinct',
    ballotMode: 'official',
    encodedBallot: 'official-precinct',
  };
  const officialAbsentee: EncodedBallotEntry = {
    ...officialPrecinct,
    ballotType: 'absentee',
    encodedBallot: 'official-absentee',
  };
  const testPrecinct: EncodedBallotEntry = {
    ...officialPrecinct,
    ballotStyleId: style2.id,
    ballotMode: 'test',
    encodedBallot: 'test-precinct',
  };
  const ballots = [officialPrecinct, officialAbsentee, testPrecinct];
  await importElectionPackageForTest(store, { electionDefinition, ballots });

  const ballotStore = store.getEncodedBallotStore();
  expect(ballotStore.hasBallots()).toEqual(true);
  expect(ballotStore.hasBallots({ ballotMode: 'test' })).toEqual(true);
  expect(ballotStore.hasBallots({ ballotMode: 'sample' })).toEqual(false);
  expect(
    ballotStore.getBallot({
      ballotStyleId: style1.id,
      precinctId,
      ballotType: 'absentee',
      ballotMode: 'official',
    })
  ).toEqual(officialAbsentee);
  expect(
    ballotStore.getBallot({
      ballotStyleId: style2.id,
      precinctId,
      ballotType: 'absentee',
      ballotMode: 'official',
    })
  ).toBeUndefined();
  const keyWithoutBallotType: Partial<EncodedBallotKey> = {
    ballotStyleId: style1.id,
    precinctId,
    ballotMode: 'official',
  };
  expect(
    ballotStore.getBallot(keyWithoutBallotType as EncodedBallotKey)
  ).toBeUndefined();
  expect(ballotStore.getBallots()).toEqual(
    ballots.map((ballot) => ({ ...ballot, id: expect.any(Number) }))
  );
  expect(ballotStore.getBallots({ ballotMode: 'official' })).toEqual([
    { ...officialPrecinct, id: expect.any(Number) },
    { ...officialAbsentee, id: expect.any(Number) },
  ]);
  expect(ballotStore.getBallotKeys({ ballotType: 'precinct' })).toEqual([
    {
      ballotStyleId: style1.id,
      precinctId,
      ballotType: 'precinct',
      ballotMode: 'official',
    },
    {
      ballotStyleId: style2.id,
      precinctId,
      ballotType: 'precinct',
      ballotMode: 'test',
    },
  ]);
});

test('importElectionPackage into a memory store replaces the previous import', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
  const ballot: EncodedBallotEntry = {
    ballotStyleId: style1.id,
    precinctId: assertDefined(election.precincts[0]).id,
    ballotType: 'precinct',
    ballotMode: 'official',
    encodedBallot: 'first',
  };
  await importElectionPackageForTest(store, {
    electionDefinition,
    ballots: [ballot],
  });
  const replacement: EncodedBallotEntry = {
    ...ballot,
    encodedBallot: 'second',
  };
  await importElectionPackageForTest(store, {
    electionDefinition,
    ballots: [replacement],
  });

  expect(store.getEncodedBallotStore().getBallots()).toEqual([
    { ...replacement, id: expect.any(Number) },
  ]);
});

test('importElectionPackage without ballots', async () => {
  const store = partialFileStore({ ...INCLUDE_ALL, ballots: false });
  await importElectionPackageForTest(store, {
    electionDefinition,
    ballots: [
      {
        ballotStyleId: style1.id,
        precinctId: assertDefined(election.precincts[0]).id,
        ballotType: 'precinct',
        ballotMode: 'official',
        encodedBallot: 'pdf',
      },
    ],
  });
  expect(
    reopenWithEverything(store).getEncodedBallotStore().hasBallots()
  ).toEqual(false);
});

test('importElectionPackage rolls back on failure', async () => {
  const store = ElectionPackageStore.memoryStore(INCLUDE_ALL);
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
    INCLUDE_ALL,
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

test('importElectionPackage rejects an import while another is running', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(
    dbPath,
    INCLUDE_ALL,
    mockBaseLogger({ fn: vi.fn })
  );
  const packageToImport = await packageImport();

  const firstImport = store.importElectionPackage(packageToImport);
  await expect(
    store.importElectionPackage({
      ...packageToImport,
      jurisdiction: 'jurisdiction-2',
    })
  ).rejects.toThrow('An election package import is already in progress');
  await firstImport;
  expect(store.getJurisdiction()).toEqual(jurisdiction);
  expect(existsSync(`${dbPath}.importing`)).toEqual(false);

  await store.importElectionPackage({
    ...packageToImport,
    jurisdiction: 'jurisdiction-2',
  });
  expect(store.getJurisdiction()).toEqual('jurisdiction-2');
});

test('fileStore leaves the live database read-only', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(
    dbPath,
    INCLUDE_ALL,
    mockBaseLogger({ fn: vi.fn })
  );
  await store.importElectionPackage(await packageImport());

  // eslint-disable-next-line no-bitwise
  expect(statSync(dbPath).mode & 0o777).toEqual(0o444);
  expect(() =>
    store
      .getUiStringsStore()
      .setUiStrings({ languageCode: 'en', data: { hello: 'Hi' } })
  ).toThrow(/readonly/);
});

test('fileStore persists and reset empties it', async () => {
  const dbPath = join(makeTemporaryDirectory(), 'election-package.db');
  const store = ElectionPackageStore.fileStore(
    dbPath,
    INCLUDE_ALL,
    mockBaseLogger({ fn: vi.fn })
  );
  expect(store.getDbPath()).toEqual(dbPath);
  await store.importElectionPackage(await packageImport());

  const reopened = ElectionPackageStore.fileStore(dbPath, INCLUDE_ALL);
  expect(reopened.getElectionRecord()?.electionDefinition).toEqual(
    electionDefinition
  );
  expect(reopened.getBallotPositionsStore().hasPositions()).toEqual(true);

  reopened.reset();
  expect(reopened.hasElection()).toEqual(false);
  expect(reopened.getSystemSettings()).toBeUndefined();
  expect(reopened.getBallotPositionsStore().hasPositions()).toEqual(false);

  reopened.close();
  expect(() => reopened.hasElection()).toThrow(/is closed/);
});
