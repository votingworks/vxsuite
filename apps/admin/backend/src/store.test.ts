import {
  electionComplexGeoSample,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import {
  safeParseSystemSettings,
  CandidateContest,
  Tabulation,
} from '@votingworks/types';
import { find, typedAs } from '@votingworks/basics';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpNameSync } from 'tmp';
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
  const store = Store.fileStore(tmpDbPath);

  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(tmpDbPath);
});

test('create a memory store', () => {
  const store = Store.memoryStore();
  expect(store).toBeInstanceOf(Store);
  expect(store.getDbPath()).toEqual(':memory:');
});

test('add an election', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
  store.assertElectionExists(electionId);
  expect(store.getElections().map((r) => r.id)).toContain(electionId);
  expect(store.getElection(electionId)).toMatchObject({
    electionDefinition: expect.anything(),
    id: electionId,
    createdAt: expect.anything(),
  });
  expect(store.getElection('not-an-id')).toEqual(undefined);
});

test('assert election exists', () => {
  const store = Store.memoryStore();
  expect(() => store.assertElectionExists('foo')).toThrowError(
    'Election not found: foo'
  );
});

test('setElectionResultsOfficial', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

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
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  expect(store.getCurrentElectionId()).toBeUndefined();

  store.setCurrentElectionId(electionId);
  expect(store.getCurrentElectionId()).toEqual(electionId);

  store.setCurrentElectionId(undefined);
  expect(store.getCurrentElectionId()).toBeUndefined();
});

/**
 * System settings tests
 */
function makeSystemSettings() {
  return safeParseSystemSettings(
    electionMinimalExhaustiveSampleFixtures.systemSettings.asText()
  ).unsafeUnwrap();
}

test('saveSystemSettings and getSystemSettings write and read system settings', () => {
  const store = Store.memoryStore();
  const systemSettings = makeSystemSettings();
  store.saveSystemSettings(systemSettings);
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toEqual(systemSettings);
});

test('getSystemSettings returns undefined when no system settings exist', () => {
  const store = Store.memoryStore();
  const retrievedSystemSettings = store.getSystemSettings();
  expect(retrievedSystemSettings).toBeUndefined();
});

test('scanner batches', () => {
  const store = Store.memoryStore();
  const electionId = store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );
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
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { electionData, election } = electionDefinition;

  const store = Store.memoryStore();
  const electionId = store.addElection(electionData);
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
  const electionId = store.addElection(electionComplexGeoSample.asText());
  const { election } = electionComplexGeoSample;

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
