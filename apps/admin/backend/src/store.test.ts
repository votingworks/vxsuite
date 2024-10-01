import { Buffer } from 'node:buffer';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  CandidateContest,
  Tabulation,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
} from '@votingworks/types';
import { find, typedAs } from '@votingworks/basics';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpNameSync } from 'tmp';
import { zipFile } from '@votingworks/test-utils';
import { sha256 } from 'js-sha256';
import { mockBaseLogger } from '@votingworks/logging';
import { Store } from './store';
import {
  ElectionRecord,
  ManualResultsVotingMethod,
  ScannerBatch,
} from './types';

test('create a file store', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'ballots.db');
  const store = Store.fileStore(tmpDbPath, mockBaseLogger());

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', async () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const systemSettings = DEFAULT_SYSTEM_SETTINGS;
  const electionPackageFileContents = await zipFile({
    [ElectionPackageFileName.ELECTION]: electionDefinition.electionData,
    [ElectionPackageFileName.SYSTEM_SETTINGS]: JSON.stringify(systemSettings),
  });
  const electionPackageHash = sha256(electionPackageFileContents);

  const store = Store.memoryStore();
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

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData:
      electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
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
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData:
      electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
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
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData:
      electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  const retrievedSystemSettings = store.getSystemSettings(electionId);
  expect(retrievedSystemSettings).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('scanner batches', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData:
      electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
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
  };
  store.addScannerBatch(scannerBatch);
  expect(store.getScannerBatches(electionId)).toEqual([scannerBatch]);

  store.deleteEmptyScannerBatches(electionId);
  expect(store.getScannerBatches(electionId)).toEqual([]);
});

test('manual results', () => {
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore();
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
  const ballotStyleId = '1M';
  const votingMethod: ManualResultsVotingMethod = 'precinct';

  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleId,
    votingMethod,
    manualResults,
  });
  expect(store.getManualResults({ electionId })).toMatchObject([
    { precinctId, ballotStyleId, votingMethod, manualResults },
  ]);
  expect(
    store.getManualResults({
      electionId,
      filter: {
        precinctIds: [precinctId],
        ballotStyleIds: [ballotStyleId],
        votingMethods: [votingMethod],
      },
    })
  ).toMatchObject([{ precinctId, ballotStyleId, votingMethod, manualResults }]);
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(1);

  // update the results, without changing the write-in candidate reference
  const editedManualResults: Tabulation.ManualElectionResults = {
    ...manualResults,
    ballotCount: 11,
  };
  store.setManualResults({
    electionId,
    precinctId,
    ballotStyleId,
    votingMethod,
    manualResults: editedManualResults,
  });
  expect(store.getManualResults({ electionId })).toMatchObject([
    {
      precinctId,
      ballotStyleId,
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
    ballotStyleId,
    votingMethod,
    manualResults: noWriteInManualResults,
  });
  expect(store.getManualResults({ electionId })).toMatchObject([
    {
      precinctId,
      ballotStyleId,
      votingMethod,
      manualResults: noWriteInManualResults,
    },
  ]);
  // write-in should be deleted as it has no references anymore
  expect(store.getWriteInCandidates({ electionId })).toHaveLength(0);

  store.deleteAllManualResults({ electionId });
  expect(store.getManualResults({ electionId })).toEqual([]);
});

function expectArrayMatch<T>(a: T[], b: T[]) {
  expect(a).toHaveLength(b.length);
  for (const item of a) {
    expect(b).toContainEqual(item);
  }
}

describe('getTabulationGroups', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  const { election } = electionPrimaryPrecinctSplitsFixtures;

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
      election.ballotStyles.map((ballotStyle) => ({
        ballotStyleId: ballotStyle.id,
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
      election.ballotStyles.flatMap((ballotStyle) =>
        ballotStyle.precincts.map((precinctId) => ({
          precinctId,
          ballotStyleId: ballotStyle.id,
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
      election.ballotStyles
        .filter((bs) => bs.partyId === '0')
        .flatMap((ballotStyle) =>
          ballotStyle.precincts.map((precinctId) => ({
            precinctId,
            ballotStyleId: ballotStyle.id,
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
          ballotStyleIds: ['m-c1-w1'],
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
  const store = Store.memoryStore();
  const electionId = store.addElection({
    electionData: electionPrimaryPrecinctSplitsFixtures.asText(),
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  const { election } = electionPrimaryPrecinctSplitsFixtures;

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
          ballotStyleIds: ['1-Ma_en'],
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
          ballotStyleIds: ['1-F_en'],
        },
      }),
      []
    );
  });

  test('party + ballot style cross-filter ', () => {
    expectArrayMatch(
      store.getFilteredContests({
        electionId,
        filter: {
          partyIds: ['1'],
          ballotStyleIds: ['1-F_en'],
        },
      }),
      ['water-1-fishing', 'congressional-1-fish', 'county-leader-fish']
    );
  });

  test('party + precinct cross-filter ', () => {
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

test('deleteElection reclaims disk space (vacuums the database)', async () => {
  const tmpDir = tmpNameSync();
  await fs.mkdir(tmpDir);
  const tmpDbPath = join(tmpDir, 'data.db');
  const store = Store.fileStore(tmpDbPath, mockBaseLogger());

  const electionId = store.addElection({
    electionData:
      electionTwoPartyPrimaryFixtures.electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });

  const beforeSize = (await fs.stat(tmpDbPath)).size;
  store.deleteElection(electionId);
  const afterSize = (await fs.stat(tmpDbPath)).size;
  expect(afterSize).toBeLessThan(beforeSize);
});
