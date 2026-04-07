import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
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
  ElectionRegisteredVotersCounts,
} from '@votingworks/types';
import { assertDefined, find, typedAs } from '@votingworks/basics';
import { join } from 'node:path';
import { zipFile } from '@votingworks/test-utils';
import { sha256 } from 'js-sha256';
import { mockBaseLogger } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
  getGroupedBallotStyles,
} from '@votingworks/utils';
import { addMockCvrFileToStore } from '../test/mock_cvr_file';
import { Store } from './store';
import {
  ElectionRecord,
  ManualResultsVotingMethod,
  ScannerBatch,
} from './types';
import { getCurrentTime } from './get_current_time';
import { STALE_MACHINE_THRESHOLD_MS } from './globals';

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

vi.mock('./get_current_time');

featureFlagMock.enableFeatureFlag(BooleanEnvironmentVariableName.EARLY_VOTING);

test('create a file store', () => {
  const tmpDir = makeTemporaryDirectory();
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(
    tmpDbPath,
    join(tmpDir, 'ballot-images'),
    mockBaseLogger({ fn: vi.fn })
  );

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const systemSettings = DEFAULT_SYSTEM_SETTINGS;
  const electionPackageFileContents = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
  });
  const electionPackageHash = sha256(electionPackageFileContents);

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents,
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
  expect(store.getElectionPackageFileContents(electionId)).toEqual(
    electionPackageFileContents
  );

  expect(store.getElection('nonexistent-id')).toEqual(undefined);
  expect(store.getElectionPackageFileContents('nonexistent-id')).toEqual(
    undefined
  );
});

test('setRegisteredVoterCounts and getRegisteredVoterCounts with precinct-only counts', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });

  expect(store.getRegisteredVoterCounts(electionId)).toBeUndefined();

  const counts: ElectionRegisteredVotersCounts = {
    'precinct-1': 500,
    'precinct-2': 300,
  };
  store.setRegisteredVoterCounts(electionId, counts);

  expect(store.getRegisteredVoterCounts(electionId)).toEqual(counts);
});

test('setRegisteredVoterCounts and getRegisteredVoterCounts with split precinct counts', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-hash',
  });

  // precinct-c2 has splits; precinct-c1-w1-1 does not
  const counts: ElectionRegisteredVotersCounts = {
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

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
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

test('current election id', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });

  expect(store.getCurrentElectionId()).toBeUndefined();

  store.setCurrentElectionId(electionId);
  expect(store.getCurrentElectionId()).toEqual(electionId);

  store.setCurrentElectionId(undefined);
  expect(store.getCurrentElectionId()).toBeUndefined();
});

test('saveSystemSettings and getSystemSettings write and read system settings', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  const retrievedSystemSettings = store.getSystemSettings(electionId);
  expect(retrievedSystemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('scanner batches', () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData: electionTwoPartyPrimaryFixtures.electionJson.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  expect(store.getScannerBatches(electionId)).toEqual([]);

  const scannerBatch: ScannerBatch = {
    electionId,
    batchId: 'batch-1',
    label: 'Batch 1',
    scannerId: 'VX-00-001',
    startedAt: '2024-11-05T08:00:00.000Z',
  };
  store.addScannerBatch(scannerBatch);
  expect(store.getScannerBatches(electionId)).toEqual([scannerBatch]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([]);
});

test('manual results', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
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
  const ballotStyleGroupId: BallotStyleGroupId = '1M' as BallotStyleGroupId;
  const votingMethod: ManualResultsVotingMethod = 'precinct';

  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleGroupId,
    votingMethod,
    manualResults,
  });
  expect(store.getManualResults({ electionId })).toMatchObject([
    { precinctId, ballotStyleGroupId, votingMethod, manualResults },
  ]);
  expect(
    store.getManualResults({
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
  expect(store.getManualResults({ electionId })).toMatchObject([
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
  expect(store.getManualResults({ electionId })).toMatchObject([
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
  expect(store.getManualResults({ electionId })).toEqual([]);
});

test('manual results - early_voting is a valid votingMethod', () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { electionData } = electionDefinition;

  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });

  const precinctId = 'precinct-1';
  const ballotStyleGroupId: BallotStyleGroupId = '1M' as BallotStyleGroupId;
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
      electionId,
      filter: { votingMethods: ['precinct'] },
    })
  ).toMatchObject([
    { votingMethod: 'precinct', manualResults: { ballotCount: 10 } },
  ]);

  expect(
    store.getManualResults({
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

  beforeAll(() => {
    store = Store.memoryStore(makeTemporaryDirectory());
    electionId = store.addElection({
      electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageFileContents: Buffer.of(),
      electionPackageHash: 'test-election-package-hash',
    });
    election = electionPrimaryPrecinctSplitsFixtures.readElection();
  });

  test('no groupings', () => {
    expect(store.getTabulationGroups({ electionId })).toEqual([{}]);
  });

  test('unsupported groupings', () => {
    expect(
      store.getTabulationGroups({ electionId, groupBy: { groupByBatch: true } })
    ).toEqual([{}]);
  });

  test('invalid filter', () => {
    expect(
      store.getTabulationGroups({
        electionId,
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
        groupBy: { groupByParty: true },
      }),
      [{ partyId: '0' }, { partyId: '1' }]
    );
  });

  test('by voting method', () => {
    expectArrayMatch(
      store.getTabulationGroups({
        electionId,
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

  beforeAll(() => {
    store = Store.memoryStore(makeTemporaryDirectory());
    electionId = store.addElection({
      electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageFileContents: Buffer.of(),
      electionPackageHash: 'test-election-package-hash',
    });
    election = electionPrimaryPrecinctSplitsFixtures.readElection();
  });

  test('no filter', () => {
    expectArrayMatch(
      store.getFilteredContests({ electionId }),
      election.contests.map((c) => c.id)
    );
  });

  test('precinct filter', () => {
    expectArrayMatch(
      store.getFilteredContests({
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

  function addCvrWithUnresolvedTag(
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
    });
    return assertDefined(cvrIds[0]);
  }

  beforeEach(() => {
    vi.mocked(getCurrentTime).mockImplementation(() => Date.now());

    store = Store.memoryStore(makeTemporaryDirectory());
    const electionDefinition =
      electionTwoPartyPrimaryFixtures.readElectionDefinition();
    electionId = store.addElection({
      electionData: electionDefinition.electionData,
      systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
      electionPackageFileContents: Buffer.of(),
      electionPackageHash: 'test-hash',
    });
    store.setCurrentElectionId(electionId);
  });

  test('claims the next unresolved CVR and skips already-claimed', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    const cvr2 = addCvrWithUnresolvedTag();

    const first = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    expect([cvr1, cvr2]).toContain(first);

    const second = store.claimBallotForClient({
      electionId,
      machineId: 'client-002',
    });
    expect([cvr1, cvr2]).toContain(second);
    expect(second).not.toEqual(first);

    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-003' })
    ).toBeUndefined();
  });

  test('released ballot can be re-claimed', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-001' })
    ).toEqual(cvr1);

    store.releaseBallotClaim({ electionId, cvrId: cvr1 });

    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-002' })
    ).toEqual(cvr1);
  });

  test('completed ballot cannot be re-claimed', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    const cvr2 = addCvrWithUnresolvedTag();
    const first = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    expect([cvr1, cvr2]).toContain(first);

    store.completeBallotClaim({ electionId, cvrId: first! });

    // Next claim should skip completed ballot and get the other
    const second = store.claimBallotForClient({
      electionId,
      machineId: 'client-002',
    });
    expect([cvr1, cvr2]).toContain(second);
    expect(second).not.toEqual(first);
  });

  test('releaseAllClaimsForMachine only releases that machines claims', () => {
    addCvrWithUnresolvedTag();
    addCvrWithUnresolvedTag();
    const claimed1 = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    store.claimBallotForClient({ electionId, machineId: 'client-002' });

    store.releaseAllClaimsForMachine({ electionId, machineId: 'client-001' });

    // client-001's ballot is free, client-002's still claimed
    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-003' })
    ).toEqual(claimed1);
    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-004' })
    ).toBeUndefined();
  });

  test('releaseAllActiveClaims releases all claimed ballots', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    const cvr2 = addCvrWithUnresolvedTag();
    expect([cvr1, cvr2]).toContain(
      store.claimBallotForClient({ electionId, machineId: 'client-001' })
    );
    expect([cvr1, cvr2]).toContain(
      store.claimBallotForClient({ electionId, machineId: 'client-002' })
    );

    store.releaseAllActiveClaims({ electionId });

    expect([cvr1, cvr2]).toContain(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-003',
      })
    );
    expect([cvr1, cvr2]).toContain(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-004',
      })
    );
  });

  test('prefers matching ballot style when provided', () => {
    const cvrA = addCvrWithUnresolvedTag('1M' as BallotStyleGroupId);
    const cvrB = addCvrWithUnresolvedTag('2F' as BallotStyleGroupId);

    expect(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-001',
        preferredBallotStyleId: '2F' as BallotStyleGroupId,
      })
    ).toEqual(cvrB);
    store.releaseAllActiveClaims({ electionId });

    expect(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-001',
        preferredBallotStyleId: '1M' as BallotStyleGroupId,
      })
    ).toEqual(cvrA);
  });

  test('excludes specified CVR IDs when claiming', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    const cvr2 = addCvrWithUnresolvedTag();

    // Exclude cvr1 — should get cvr2
    expect(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-001',
        excludeCvrIds: [cvr1],
      })
    ).toEqual(cvr2);

    // Exclude both — should get nothing
    store.releaseBallotClaim({ cvrId: cvr2, electionId });
    expect(
      store.claimBallotForClient({
        electionId,
        machineId: 'client-002',
        excludeCvrIds: [cvr1, cvr2],
      })
    ).toBeUndefined();
  });

  test('cleanupStaleMachines releases claims for stale machines', () => {
    addCvrWithUnresolvedTag();
    addCvrWithUnresolvedTag();

    store.setNetworkedMachineStatus(
      'client-001',
      'client',
      Admin.ClientMachineStatus.Active
    );
    const claimed = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });

    // Advance time past the stale threshold
    vi.mocked(getCurrentTime).mockImplementation(
      () => Date.now() + STALE_MACHINE_THRESHOLD_MS + 1
    );
    store.cleanupStaleMachines();

    // The claim should have been released — same ballot is now available
    vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-002' })
    ).toEqual(claimed);
  });

  test('disabling client adjudication releases all active claims', () => {
    addCvrWithUnresolvedTag();
    addCvrWithUnresolvedTag();
    store.claimBallotForClient({ electionId, machineId: 'client-001' });
    store.claimBallotForClient({ electionId, machineId: 'client-002' });

    store.setIsClientAdjudicationEnabled(false);

    // Both claims should be released — can claim again
    expect(
      store.claimBallotForClient({ electionId, machineId: 'client-003' })
    ).toBeDefined();
  });

  test('host queue includes claimed CVRs for stable display', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    const cvr2 = addCvrWithUnresolvedTag();
    const claimed = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    expect([cvr1, cvr2]).toContain(claimed);

    // Queue includes claimed ballots so "X of N" is stable
    const queue = store.getBallotAdjudicationQueue({ electionId });
    expect(queue).toContain(cvr1);
    expect(queue).toContain(cvr2);

    // Next unresolved skips claimed ballots
    const next = store.getNextCvrIdForBallotAdjudication({ electionId });
    expect([cvr1, cvr2]).toContain(next);
    expect(next).not.toEqual(claimed);
  });

  test('getClaimedBallotCvrIds returns actively claimed CVR IDs', () => {
    addCvrWithUnresolvedTag();
    addCvrWithUnresolvedTag();

    expect(store.getClaimedBallotCvrIds({ electionId })).toEqual([]);

    const first = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    expect(store.getClaimedBallotCvrIds({ electionId })).toEqual([first]);

    const second = store.claimBallotForClient({
      electionId,
      machineId: 'client-002',
    });
    expect(store.getClaimedBallotCvrIds({ electionId })).toHaveLength(2);
    expect(store.getClaimedBallotCvrIds({ electionId })).toContain(first);
    expect(store.getClaimedBallotCvrIds({ electionId })).toContain(second);

    store.releaseBallotClaim({ cvrId: first!, electionId });
    expect(store.getClaimedBallotCvrIds({ electionId })).toEqual([second]);
  });

  test('claimBallotForAdjudication claims a specific CVR for the host', () => {
    const cvr1 = addCvrWithUnresolvedTag();
    addCvrWithUnresolvedTag();

    store.claimBallotForAdjudication({
      electionId,
      cvrId: cvr1,
      machineId: 'host-001',
    });

    // Host claim blocks clients from claiming the same ballot
    const clientClaim = store.claimBallotForClient({
      electionId,
      machineId: 'client-001',
    });
    expect(clientClaim).not.toEqual(cvr1);

    // Duplicate claim is ignored (INSERT OR IGNORE)
    store.claimBallotForAdjudication({
      electionId,
      cvrId: cvr1,
      machineId: 'host-001',
    });
  });

  test('getMachines returns Adjudicating status for machines with active claims', () => {
    addCvrWithUnresolvedTag();

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

    // Before any claims, both machines are Active
    let machines = store.getMachines();
    expect(machines.find((m) => m.machineId === 'client-001')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );
    expect(machines.find((m) => m.machineId === 'client-002')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );

    // client-001 claims a ballot
    store.claimBallotForClient({ electionId, machineId: 'client-001' });

    // Now client-001 should show as Adjudicating, client-002 still Active
    machines = store.getMachines();
    expect(machines.find((m) => m.machineId === 'client-001')?.status).toEqual(
      Admin.ClientMachineStatus.Adjudicating
    );
    expect(machines.find((m) => m.machineId === 'client-002')?.status).toEqual(
      Admin.ClientMachineStatus.Active
    );

    // After releasing, client-001 goes back to Active
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
