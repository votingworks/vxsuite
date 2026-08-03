import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import {
  Admin,
  CandidateContest,
  Tabulation,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  BallotStyleGroupId,
  Id,
  Election,
  ElectionRegisteredVoterCounts,
  SystemSettings,
} from '@votingworks/types';
import { assertDefined, find, typedAs } from '@votingworks/basics';
import { join } from 'node:path';
import { zipFile } from '@votingworks/test-utils';
import { sha256 } from 'js-sha256';
import { mockBaseLogger } from '@votingworks/logging';
import { getGroupedBallotStyles } from '@votingworks/utils';
import { addMockCvrFileToStore } from '../test/mock_cvr_file';
import { Store } from './store';
import {
  ElectionRecord,
  ManualResultsVotingMethod,
  ScannerBatch,
} from './types';
import { getCurrentTime } from './get_current_time';
import { STALE_MACHINE_THRESHOLD_MS } from './globals';

vi.mock('./get_current_time');

const systemSettings: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  enableEarlyVoting: true,
};
const systemSettingsData = JSON.stringify(systemSettings);

test('create a file store', () => {
  const tmpDir = makeTemporaryDirectory();
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(
    tmpDbPath,
    join(tmpDir, 'ballot-images'),
    join(tmpDir, 'election-packages'),
    mockBaseLogger({ fn: vi.fn })
  );

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
}, 30_000);

test('create a memory store', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionPackageFileContents = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: systemSettingsData,
  });
  const electionPackageHash = sha256(electionPackageFileContents);

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile({
      content: electionPackageFileContents,
    }),
    electionPackageHash,
  });

  store.assertElectionExists(electionId);
  expect(store.getElections().map((r) => r.id)).toContain(electionId);

  expect(store.getElection(electionId)).toEqual({
    createdAt: expect.anything(),
    electionDefinition,
    id: electionId,
    isOfficialResults: false,
    electionPackageHash,
  });
  expect(
    readFileSync(assertDefined(store.getElectionPackageFilePath(electionId)))
  ).toEqual(electionPackageFileContents);

  expect(store.getElection('nonexistent-id')).toEqual(undefined);
  expect(store.getElectionPackageFilePath('nonexistent-id')).toEqual(undefined);
});

test('addElection surfaces the copy error when the package source is missing', async () => {
  const tempDirectory = makeTemporaryDirectory();
  const store = Store.memoryStore(tempDirectory);
  await expect(
    store.addElection({
      electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageSourceFilePath: join(tempDirectory, 'does-not-exist.zip'),
      electionPackageHash: 'test-hash',
    })
  ).rejects.toThrow(/ENOENT/);

  expect(readdirSync(join(tempDirectory, 'election-packages'))).toEqual([]);
});

test('addElection cleanup in case of failure', async () => {
  const tempDirectory = makeTemporaryDirectory();
  const store = Store.memoryStore(tempDirectory);
  await expect(
    store.addElection({
      electionData: `${electionTwoPartyPrimaryFixtures.electionJson.asText()}!UH-OH-CORRUPTED`,
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageSourceFilePath: makeTemporaryFile(),
      electionPackageHash: 'test-hash',
    })
  ).rejects.toThrow();

  expect(readdirSync(tempDirectory)).toContain('election-packages');
  expect(readdirSync(join(tempDirectory, 'election-packages'))).toEqual([]);
});

test('setRegisteredVoterCounts and getRegisteredVoterCounts with precinct-only counts', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-hash',
  });

  expect(store.getRegisteredVoterCounts(electionId)).toBeUndefined();

  const counts: ElectionRegisteredVoterCounts = {
    'precinct-1': 500,
    'precinct-2': 300,
  };
  store.setRegisteredVoterCounts(electionId, counts);

  expect(store.getRegisteredVoterCounts(electionId)).toEqual(counts);
});

test('setRegisteredVoterCounts and getRegisteredVoterCounts with split precinct counts', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-hash',
  });

  // precinct-c2 has splits; precinct-c1-w1-1 does not
  const counts: ElectionRegisteredVoterCounts = {
    'precinct-c1-w1-1': 400,
    'precinct-c2': {
      splits: {
        'precinct-c2-split-1': 200,
        'precinct-c2-split-2': 150,
      },
    },
  };
  store.setRegisteredVoterCounts(electionId, counts);

  expect(store.getRegisteredVoterCounts(electionId)).toEqual(counts);
});

test('assert election exists', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('setElectionResultsOfficial', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, true);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: true,
      })
    )
  );

  store.setElectionResultsOfficial(electionId, false);

  expect(store.getElection(electionId)).toEqual(
    expect.objectContaining(
      typedAs<Partial<ElectionRecord>>({
        isOfficialResults: false,
      })
    )
  );
});

test('current election id', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });

  expect(store.getCurrentElectionId()).toBeUndefined();

  store.setCurrentElectionId(electionId);
  expect(store.getCurrentElectionId()).toEqual(electionId);

  store.setCurrentElectionId(undefined);
  expect(store.getCurrentElectionId()).toBeUndefined();
});

test('saveSystemSettings and getSystemSettings write and read system settings', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  const retrievedSystemSettings = store.getSystemSettings(electionId);
  expect(retrievedSystemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('scanner batches', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getScannerBatches(electionId)).toEqual([]);

  const scannerBatch: ScannerBatch = {
    electionId,
    batchId: 'batch-1',
    label: 'Batch 1',
    scannerId: 'VX-00-001',
    scannerMachineType: 'precinct',
    pollingPlaceId: 'polling-place-1',
    startedAt: '2024-11-05T08:00:00.000Z',
  };
  store.addScannerBatch(scannerBatch);
  expect(store.getScannerBatches(electionId)).toEqual([scannerBatch]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([]);
});

test('delete empty scanner batches', async () => {
  const fixtures = electionTwoPartyPrimaryFixtures;
  const election = fixtures.readElection();
  const ballotStyleGroups = getGroupedBallotStyles(election.ballotStyles);
  const ballotStyleGroup = assertDefined(ballotStyleGroups[0]);

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: fixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });

  const batchWithCvrs: ScannerBatch = {
    electionId,
    batchId: '1',
    label: 'Batch 1',
    scannerId: 'scanner-1',
    pollingPlaceId: 'polling-place-1',
    startedAt: expect.any(String),
  };

  const contest = find(
    election.contests,
    (c): c is CandidateContest => c.type === 'candidate'
  );

  addMockCvrFileToStore({
    electionId,
    store,
    mockCastVoteRecordFile: [
      {
        ballotStyleGroupId: ballotStyleGroup.id,
        batchId: batchWithCvrs.batchId,
        scannerId: batchWithCvrs.scannerId,
        precinctId: 'precinct-1',
        votingMethod: 'precinct',
        votes: { [contest.id]: [contest.candidates[0]!.id] },
        card: { type: 'bmd' },
      },
    ],
    pollingPlaceId: 'polling-place-1',
  });

  const emptyBatch: ScannerBatch = {
    electionId,
    batchId: '2',
    label: 'Batch 2',
    scannerId: 'scanner-2',
    startedAt: '2024-11-05T09:00:00.000Z',
  };

  store.addScannerBatch(emptyBatch);

  expect(store.getScannerBatches(electionId)).toEqual([
    batchWithCvrs,
    emptyBatch,
  ]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([batchWithCvrs]);
});

test('getWriteInCandidates returns no candidates for an empty contestIds filter', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });

  store.addWriteInCandidate({
    electionId,
    contestId: 'zoo-council-mammal',
    name: 'Mr. Pickles',
  });

  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);
  expect(store.getWriteInCandidates({ electionId, contestIds: [] })).toEqual(
    []
  );
});

test('manual results', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  const contestId = 'zoo-council-mammal';
  const writeInCandidate = store.addWriteInCandidate({
    electionId,
    contestId,
    name: 'Mr. Pickles',
  });
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  const contest = find(
    election.contests,
    (c) => c.id === contestId
  ) as CandidateContest;
  const contestResults: Tabulation.ContestResults = {
    contestId: contest.id,
    contestType: contest.type,
    votesAllowed: contest.seats,
    overvotes: 0,
    undervotes: 20,
    ballots: 10,
    tallies: {
      [writeInCandidate.id]: {
        tally: 10,
        id: writeInCandidate.id,
        name: writeInCandidate.name,
        isWriteIn: true,
      },
    },
  };
  const manualResults: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {
      [contestId]: contestResults,
    },
  };
  const precinctId = 'precinct-1';
  const ballotStyleGroupId: BallotStyleGroupId = '1M';
  const votingMethod: ManualResultsVotingMethod = 'precinct';

  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod,
    manualResults,
  });
  expect(store.getManualResults({ election, electionId })).toMatchObject([
    { precinctId, ballotStyleGroupId, votingMethod, manualResults },
  ]);
  expect(
    store.getManualResults({
      election,
      electionId,
      filter: {
        precinctIds: [precinctId],
        ballotStyleGroupIds: [ballotStyleGroupId],
        votingMethods: [votingMethod],
      },
    })
  ).toMatchObject([
    { precinctId, ballotStyleGroupId, votingMethod, manualResults },
  ]);
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  // update the results, without changing the write-in candidate reference
  const editedManualResults: Tabulation.ManualElectionResults = {
    ...manualResults,
    ballotCount: 11,
  };
  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod,
    manualResults: editedManualResults,
  });
  expect(store.getManualResults({ election, electionId })).toMatchObject([
    {
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: editedManualResults,
    },
  ]);
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  // update the results, and change the write-in candidate reference
  const noWriteInManualResults: Tabulation.ManualElectionResults = {
    ballotCount: 11,
    contestResults: {
      ...manualResults.contestResults,
      [contestId]: {
        ...contestResults,
        tallies: {},
      },
    },
  };
  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod,
    manualResults: noWriteInManualResults,
  });
  expect(store.getManualResults({ election, electionId })).toMatchObject([
    {
      precinctId,
      ballotStyleGroupId,
      votingMethod,
      manualResults: noWriteInManualResults,
    },
  ]);
  // write-in should be deleted as it has no references anymore
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(0);

  store.deleteAllManualResults({ electionId });
  expect(store.getManualResults({ election, electionId })).toEqual([]);
});

test('manual results - early_voting is a valid votingMethod', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });

  const precinctId = 'precinct-1';
  const ballotStyleGroupId: BallotStyleGroupId = '1M';
  const simpleResults: Tabulation.ManualElectionResults = {
    ballotCount: 10,
    contestResults: {},
  };

  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod: 'precinct',
    manualResults: simpleResults,
  });
  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod: 'early_voting',
    manualResults: { ...simpleResults, ballotCount: 25 },
  });

  expect(
    store.getManualResults({
      election,
      electionId,
      filter: { votingMethods: ['precinct'] },
    })
  ).toMatchObject([
    { votingMethod: 'precinct', manualResults: { ballotCount: 10 } },
  ]);

  expect(
    store.getManualResults({
      election,
      electionId,
      filter: { votingMethods: ['early_voting'] },
    })
  ).toMatchObject([
    { votingMethod: 'early_voting', manualResults: { ballotCount: 25 } },
  ]);
});

function expectArrayMatch<T>(a: T[], b: T[]) {
  expect(a).toHaveLength(b.length);
  for (const item of a) {
    expect(b).toContainEqual(item);
  }
}

describe('getTabulationGroups', () => {
  let store: Store;
  let electionId: Id;
  let election: Election;

  beforeAll(async () => {
    store = Store.memoryStore(makeTemporaryDirectory());
    electionId = await store.addElection({
      electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
      systemSettingsData,
      electionPackageSourceFilePath: makeTemporaryFile(),
      electionPackageHash: 'test-election-package-hash',
    });
    election = electionPrimaryPrecinctSplitsFixtures.readElection();
  });

  test('no groupings', () => {
    expect(store.getTabulationGroups({ electionId, election })).toEqual([{}]);
  });

  test('unsupported groupings', () => {
    expect(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByBatch: true },
      })
    ).toEqual([{}]);
  });

  test('invalid filter', () => {
    expect(
      store.getTabulationGroups({
        electionId,
        election,
        filter: {
          precinctIds: [],
        },
      })
    ).toEqual([]);
  });

  test('by precinct', () => {
    expect(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByPrecinct: true },
      })
    ).toEqual(
      election.precincts.map((precinct) => ({ precinctId: precinct.id }))
    );
  });

  test('by ballot style', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByBallotStyle: true },
      }),
      getGroupedBallotStyles(election.ballotStyles).map((ballotStyleGroup) => ({
        ballotStyleGroupId: ballotStyleGroup.id,
      }))
    );
  });

  test('by party', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByParty: true },
      }),
      [{ partyId: '0' }, { partyId: '1' }]
    );
  });

  test('by voting method', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByVotingMethod: true },
      }),
      Tabulation.SUPPORTED_VOTING_METHODS.map((votingMethod) => ({
        votingMethod,
      }))
    );
  });

  test('by precinct and ballot style', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByBallotStyle: true, groupByPrecinct: true },
      }),
      getGroupedBallotStyles(election.ballotStyles).flatMap(
        (ballotStyleGroup) =>
          ballotStyleGroup.precincts.map((precinctId) => ({
            precinctId,
            ballotStyleGroupId: ballotStyleGroup.id,
          }))
      )
    );
  });

  test('by precinct and voting method', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByVotingMethod: true, groupByPrecinct: true },
      }),
      election.precincts.flatMap((precinct) =>
        Tabulation.SUPPORTED_VOTING_METHODS.map((votingMethod) => ({
          precinctId: precinct.id,
          votingMethod,
        }))
      )
    );
  });

  test('by precinct + filter on precinct', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByPrecinct: true },
        filter: {
          precinctIds: ['precinct-c1-w1-1'],
        },
      }),
      [
        {
          precinctId: 'precinct-c1-w1-1',
        },
      ]
    );
  });

  test('by precinct and ballot style + filter on party', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByBallotStyle: true, groupByPrecinct: true },
        filter: {
          partyIds: ['0'],
        },
      }),
      getGroupedBallotStyles(election.ballotStyles)
        .filter((bs) => bs.partyId === '0')
        .flatMap((ballotStyle) =>
          ballotStyle.precincts.map((precinctId) => ({
            precinctId,
            ballotStyleGroupId: ballotStyle.id,
          }))
        )
    );
  });

  test('by precinct and ballot style + filter on ballot style', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByBallotStyle: true, groupByPrecinct: true },
        filter: {
          ballotStyleGroupIds: ['m-c1-w1'] as BallotStyleGroupId[],
        },
      }),
      election.ballotStyles
        .filter((bs) => bs.id === 'm-c1-w1')
        .flatMap((ballotStyle) =>
          ballotStyle.precincts.map((precinctId) => ({
            precinctId,
            ballotStyleId: ballotStyle.id,
          }))
        )
    );
  });

  test('by precinct and voting method + filter on voting method', () => {
    expect(
      store.getTabulationGroups({
        electionId,
        election,
        groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
        filter: {
          votingMethods: ['absentee'],
        },
      })
    ).toEqual(
      election.precincts.map((precinct) => ({
        precinctId: precinct.id,
        votingMethod: 'absentee',
      }))
    );
  });
});

describe('getFilteredContests', () => {
  let store: Store;
  let electionId: Id;
  let election: Election;

  beforeAll(async () => {
    store = Store.memoryStore(makeTemporaryDirectory());
    electionId = await store.addElection({
      electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
      systemSettingsData,
      electionPackageSourceFilePath: makeTemporaryFile(),
      electionPackageHash: 'test-election-package-hash',
    });
    election = electionPrimaryPrecinctSplitsFixtures.readElection();
  });

  test('no filter', () => {
    expectArrayMatch(
      store.getFilteredContests({ election, electionId }),
      election.contests.map((c) => c.id)
    );
  });

  test('precinct filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          precinctIds: ['precinct-c1-w2'],
        },
      }),
      [
        'county-leader-mammal',
        'county-leader-fish',
        'congressional-1-mammal',
        'congressional-1-fish',
        'water-2-fishing',
      ]
    );
  });

  test('ballot style filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          ballotStyleGroupIds: ['1-Ma'] as BallotStyleGroupId[],
        },
      }),
      ['county-leader-mammal', 'congressional-1-mammal', 'water-1-fishing']
    );
  });

  test('party filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          partyIds: ['0'],
        },
      }),
      [
        'county-leader-mammal',
        'congressional-1-mammal',
        'congressional-2-mammal',
        'water-1-fishing',
        'water-2-fishing',
      ]
    );
  });

  test('impossible cross-filter, no matches', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          partyIds: ['0'],
          ballotStyleGroupIds: ['1-F'] as BallotStyleGroupId[],
        },
      }),
      []
    );
  });

  test('party + ballot style cross-filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          partyIds: ['1'],
          ballotStyleGroupIds: ['1-F'] as BallotStyleGroupId[],
        },
      }),
      ['water-1-fishing', 'congressional-1-fish', 'county-leader-fish']
    );
  });

  test('party + precinct cross-filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
        election,
        electionId,
        filter: {
          partyIds: ['1'],
          precinctIds: ['precinct-c1-w1-1'],
        },
      }),
      ['water-1-fishing', 'congressional-1-fish', 'county-leader-fish']
    );
  });
});

describe('machine ballot adjudication assignments', () => {
  let store: Store;
  let electionId: Id;

  function addCvrWithWriteIn(
    ballotStyleGroupId = '1M' as BallotStyleGroupId
  ): string {
    const cvrIds = addMockCvrFileToStore({
      electionId,
      store,
      mockCastVoteRecordFile: [
        {
          ballotStyleGroupId,
          batchId: 'batch-1',
          scannerId: 'scanner-1',
          precinctId: 'precinct-1',
          votingMethod: 'precinct',
          votes: { 'zoo-council-mammal': ['write-in-0'] },
          card: { type: 'bmd' },
        },
      ],
      pollingPlaceId: 'polling-place-1',
    });
    return assertDefined(cvrIds[0]);
  }

  // Wraps the unified claimAndLoadBallotData "find next" path and returns just
  // the claimed cvrId, mirroring the pre-refactor claimBallotForClient.
  function claimNextForClient(
    machineId: string,
    afterCvrId?: string
  ): string | undefined {
    return store
      .claimAndLoadBallotData({ electionId, machineId, afterCvrId })
      .unsafeUnwrap()?.cvrId;
  }

  beforeEach(async () => {
    vi.mocked(getCurrentTime).mockImplementation(() => Date.now());

    store = Store.memoryStore(makeTemporaryDirectory());
    const electionDefinition =
      electionTwoPartyPrimaryFixtures.readElectionDefinition();
    electionId = await store.addElection({
      electionData: electionDefinition.electionData,
      systemSettingsData,
      electionPackageSourceFilePath: makeTemporaryFile(),
      electionPackageHash: 'test-hash',
    });
    store.setCurrentElectionId(electionId);
  });

  test('claims the next unadjudicated CVR and skips already-claimed', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();

    const first = claimNextForClient('client-001');
    expect([cvr1, cvr2]).toContain(first);

    const second = claimNextForClient('client-002');
    expect([cvr1, cvr2]).toContain(second);
    expect(second).not.toEqual(first);

    expect(claimNextForClient('client-003')).toBeUndefined();
  });

  test('released ballot can be re-claimed', () => {
    const cvr1 = addCvrWithWriteIn();
    expect(claimNextForClient('client-001')).toEqual(cvr1);

    store.releaseBallotClaim({ electionId, cvrId: cvr1 });

    expect(claimNextForClient('client-002')).toEqual(cvr1);
  });

  test('no-cursor claim is idempotent — returns the existing claim', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();

    const first = claimNextForClient('client-001');
    expect([cvr1, cvr2]).toContain(first);

    // Calling again with no cursor returns the same ballot rather than
    // grabbing a second one.
    expect(claimNextForClient('client-001')).toEqual(first);

    // The machine still holds exactly that one claim, so another machine can
    // still take the other ballot.
    const second = claimNextForClient('client-002');
    expect([cvr1, cvr2]).toContain(second);
    expect(second).not.toEqual(first);
  });

  test('claiming a specific cvrId held by another machine returns claim-failed', () => {
    const cvr1 = addCvrWithWriteIn();
    expect(claimNextForClient('client-001')).toEqual(cvr1);

    // A different machine asking for that exact cvrId is rejected.
    const result = store.claimAndLoadBallotData({
      electionId,
      machineId: 'client-002',
      cvrId: cvr1,
    });
    expect(result.err()).toEqual({ type: 'claim-failed' });
  });

  test('completed ballot cannot be re-claimed', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();
    const first = claimNextForClient('client-001');
    expect([cvr1, cvr2]).toContain(first);

    store.completeBallotClaim({
      electionId,
      cvrId: first!,
      machineId: 'client-001',
    });

    // A completed claim is no longer an active claim
    expect(
      store.hasBallotClaim({
        electionId,
        cvrId: assertDefined(first),
        machineId: 'client-001',
      })
    ).toEqual(false);

    const second = claimNextForClient('client-002');
    expect([cvr1, cvr2]).toContain(second);
    expect(second).not.toEqual(first);
  });

  test('setCvrAdjudicated completes claim when machineId provided', () => {
    const cvr1 = addCvrWithWriteIn();
    claimNextForClient('client-001');
    store.setCvrAdjudicated({ cvrId: cvr1, machineId: 'client-001' });

    // Claim should be completed — CVR is no longer claimable
    expect(claimNextForClient('client-002')).toBeUndefined();
  });

  test('setCvrAdjudicated skips claim completion when machineId omitted', () => {
    const cvr1 = addCvrWithWriteIn();
    claimNextForClient('client-001');
    store.setCvrAdjudicated({ cvrId: cvr1 });

    // Claim should still be active (not completed) because no machineId
    // But the CVR is resolved so it won't appear in the queue
    expect(
      store.hasBallotClaim({
        electionId,
        cvrId: cvr1,
        machineId: 'client-001',
      })
    ).toEqual(true);
  });

  test('releaseAllClaimsForMachine only releases that machines claims', () => {
    addCvrWithWriteIn();
    addCvrWithWriteIn();
    const claimed1 = claimNextForClient('client-001');
    claimNextForClient('client-002');

    store.releaseAllClaimsForMachine({ electionId, machineId: 'client-001' });

    expect(claimNextForClient('client-003')).toEqual(claimed1);
    expect(claimNextForClient('client-004')).toBeUndefined();
  });

  test('releaseAllActiveClaims releases all claimed ballots', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();
    expect([cvr1, cvr2]).toContain(claimNextForClient('client-001'));
    expect([cvr1, cvr2]).toContain(claimNextForClient('client-002'));

    store.releaseAllActiveClaims({ electionId });

    expect([cvr1, cvr2]).toContain(claimNextForClient('client-003'));
    expect([cvr1, cvr2]).toContain(claimNextForClient('client-004'));
  });

  test('afterCvrId cursor advances and wraps around the end of the queue', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();

    // Discover the canonical queue order, then release so both are claimable.
    const first = claimNextForClient('client-001');
    expect([cvr1, cvr2]).toContain(first);
    store.releaseAllActiveClaims({ electionId });
    const second = first === cvr1 ? cvr2 : cvr1;

    // Claiming after the first ballot returns the second.
    expect(claimNextForClient('client-002', first)).toEqual(second);

    // After the last ballot, the search wraps back to the still-unclaimed
    // first ballot (client-002 still holds `second`).
    expect(claimNextForClient('client-003', second)).toEqual(first);
  });

  test('cleanupStaleMachines releases claims for stale machines', () => {
    addCvrWithWriteIn();
    addCvrWithWriteIn();

    store.setNetworkedMachineStatus(
      'client-001',
      'client',
      Admin.ClientMachineStatus.Active
    );
    const claimed = claimNextForClient('client-001');

    vi.mocked(getCurrentTime).mockImplementation(
      () => Date.now() + STALE_MACHINE_THRESHOLD_MS + 1
    );
    store.cleanupStaleMachines();

    vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
    expect(claimNextForClient('client-002')).toEqual(claimed);
  });

  test('cleanupStaleMachines leaves fresh machines claims intact', () => {
    addCvrWithWriteIn();
    addCvrWithWriteIn();

    store.setNetworkedMachineStatus(
      'client-001',
      'client',
      Admin.ClientMachineStatus.Active
    );
    store.setNetworkedMachineStatus(
      'client-002',
      'client',
      Admin.ClientMachineStatus.Active
    );
    const staleClaim = claimNextForClient('client-001');
    const freshClaim = assertDefined(claimNextForClient('client-002'));

    vi.mocked(getCurrentTime).mockImplementation(
      () => Date.now() + STALE_MACHINE_THRESHOLD_MS + 1
    );
    // client-002 heartbeats again, so only client-001 is stale
    store.setNetworkedMachineStatus(
      'client-002',
      'client',
      Admin.ClientMachineStatus.Active
    );
    store.cleanupStaleMachines();

    vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
    // Only the stale machine's ballot is claimable again
    expect(claimNextForClient('client-003')).toEqual(staleClaim);
    expect(claimNextForClient('client-004')).toBeUndefined();
    expect(
      store.hasBallotClaim({
        electionId,
        cvrId: freshClaim,
        machineId: 'client-002',
      })
    ).toEqual(true);
  });

  test('disabling client adjudication releases all active claims', () => {
    addCvrWithWriteIn();
    addCvrWithWriteIn();
    claimNextForClient('client-001');
    claimNextForClient('client-002');

    store.setIsClientAdjudicationEnabled(false);

    expect(claimNextForClient('client-003')).toBeDefined();
  });

  test('host queue includes claimed CVRs for stable display', () => {
    const cvr1 = addCvrWithWriteIn();
    const cvr2 = addCvrWithWriteIn();
    const claimed = claimNextForClient('client-001');
    expect([cvr1, cvr2]).toContain(claimed);

    const queue = store.getBallotAdjudicationQueue({ electionId });
    expect(queue).toContain(cvr1);
    expect(queue).toContain(cvr2);

    const next = store.getNextCvrIdForBallotAdjudication({
      electionId,
      machineId: 'host-001',
    });
    expect([cvr1, cvr2]).toContain(next);
    expect(next).not.toEqual(claimed);
  });

  test('claimBallotForAdjudication claims a specific CVR for the host', () => {
    const cvr1 = addCvrWithWriteIn();
    addCvrWithWriteIn();

    store.claimBallotForAdjudication({
      electionId,
      cvrId: cvr1,
      machineId: 'host-001',
    });

    const clientClaim = claimNextForClient('client-001');
    expect(clientClaim).not.toEqual(cvr1);

    // Duplicate claim by same machine is idempotent
    expect(
      store.claimBallotForAdjudication({
        electionId,
        cvrId: cvr1,
        machineId: 'host-001',
      })
    ).toEqual(true);

    // Different machine trying to claim the same ballot fails
    expect(
      store.claimBallotForAdjudication({
        electionId,
        cvrId: cvr1,
        machineId: 'host-002',
      })
    ).toEqual(false);
  });

  test('getMachines returns Adjudicating status for machines with active claims', () => {
    addCvrWithWriteIn();

    store.setNetworkedMachineStatus(
      'client-001',
      'client',
      Admin.ClientMachineStatus.Active
    );
    store.setNetworkedMachineStatus(
      'client-002',
      'client',
      Admin.ClientMachineStatus.Active
    );

    let machines = store.getMachines();
    expect(machines.find((m) => m.machineId === 'client-001')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );
    expect(machines.find((m) => m.machineId === 'client-002')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );

    claimNextForClient('client-001');

    machines = store.getMachines();
    expect(machines.find((m) => m.machineId === 'client-001')?.status).toEqual(
      Admin.ClientMachineStatus.Adjudicating
    );
    expect(machines.find((m) => m.machineId === 'client-002')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );

    store.releaseAllClaimsForMachine({
      electionId,
      machineId: 'client-001',
    });
    machines = store.getMachines();
    expect(machines.find((m) => m.machineId === 'client-001')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );
  });
});
