import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  GROUP_KEY_ROOT,
  buildElectionResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { buildMockArtifactAuthenticator } from '@votingworks/auth';
import { Tabulation } from '@votingworks/types';
import {
  tabulateCastVoteRecords,
  tabulateElectionResults,
} from './full_results';
import { Store } from '../store';
import { addCastVoteRecordReport } from '../cvr_files';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';

// mock SKIP_CVR_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('tabulateCastVoteRecords', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection(electionData);
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['yes'] },
      card: { type: 'bmd' },
      multiplier: 34,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  // because we're only testing filtering and grouping, these results can be simple
  function getMockElectionResults(
    fishingTally: number
  ): Tabulation.ElectionResults {
    return buildElectionResultsFixture({
      election,
      cardCounts: {
        bmd: fishingTally,
        hmpb: [],
      },
      contestResultsSummaries: {
        fishing: {
          type: 'yesno',
          ballots: fishingTally,
          overvotes: 0,
          undervotes: 0,
          yesTally: fishingTally,
          noTally: 0,
        },
      },
      includeGenericWriteIn: true,
    });
  }

  const testCases: Array<{
    filter?: Tabulation.Filter;
    groupBy?: Tabulation.GroupBy;
    expected: Array<
      [
        groupKey: Tabulation.GroupKey,
        tally: number,
        groupSpecifier: Tabulation.GroupSpecifier
      ]
    >;
  }> = [
    // no filter case
    {
      expected: [['root', 83, {}]],
    },
    // each filter case
    {
      filter: { precinctIds: ['precinct-2'] },
      expected: [['root', 55, {}]],
    },
    {
      filter: { scannerIds: ['scanner-2'] },
      expected: [['root', 21, {}]],
    },
    {
      filter: { batchIds: ['batch-2-1', 'batch-3-1'] },
      expected: [['root', 43, {}]],
    },
    {
      filter: { votingMethods: ['precinct'] },
      expected: [['root', 68, {}]],
    },
    {
      filter: { ballotStyleIds: ['1M'] },
      expected: [['root', 45, {}]],
    },
    {
      filter: { partyIds: ['0'] },
      expected: [['root', 45, {}]],
    },
    // empty filter case
    {
      filter: { partyIds: [] },
      expected: [['root', 0, {}]],
    },
    // trivial filter case
    {
      filter: { partyIds: ['0', '1'] },
      expected: [['root', 83, {}]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['root&1M', 45, { ballotStyleId: '1M' }],
        ['root&2F', 38, { ballotStyleId: '2F' }],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['root&0', 45, { partyId: '0' }],
        ['root&1', 38, { partyId: '1' }],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['root&batch-1-1', 11, { batchId: 'batch-1-1' }],
        ['root&batch-1-2', 17, { batchId: 'batch-1-2' }],
        ['root&batch-2-1', 9, { batchId: 'batch-2-1' }],
        ['root&batch-2-2', 12, { batchId: 'batch-2-2' }],
        ['root&batch-3-1', 34, { batchId: 'batch-3-1' }],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['root&scanner-1', 28, { scannerId: 'scanner-1' }],
        ['root&scanner-2', 21, { scannerId: 'scanner-2' }],
        ['root&scanner-3', 34, { scannerId: 'scanner-3' }],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['root&precinct-1', 28, { precinctId: 'precinct-1' }],
        ['root&precinct-2', 55, { precinctId: 'precinct-2' }],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['root&precinct', 68, { votingMethod: 'precinct' }],
        ['root&absentee', 15, { votingMethod: 'absentee' }],
      ],
    },
  ];

  for (const { filter, groupBy, expected } of testCases) {
    const groupedWriteInSummaries = tabulateCastVoteRecords({
      electionId,
      store,
      filter,
      groupBy,
    });

    for (const [groupKey, tally, groupSpecifier] of expected) {
      expect(groupedWriteInSummaries[groupKey]).toEqual({
        ...getMockElectionResults(tally),
        ...groupSpecifier,
      });
    }

    expect(Object.values(groupedWriteInSummaries)).toHaveLength(
      expected.length
    );
  }
});

describe('tabulateElectionResults', () => {
  test('with no grouping', async () => {
    const store = Store.memoryStore();

    const { electionDefinition, castVoteRecordReport } =
      electionGridLayoutNewHampshireAmherstFixtures;
    const electionId = store.addElection(electionDefinition.electionData);
    store.setCurrentElectionId(electionId);

    const addReportResult = await addCastVoteRecordReport({
      store,
      reportDirectoryPath: castVoteRecordReport.asDirectoryPath(),
      exportedTimestamp: new Date().toISOString(),
      artifactAuthenticator: buildMockArtifactAuthenticator(),
    });
    const { id: fileId } = addReportResult.unsafeUnwrap();
    expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

    const initialResultsWithoutWriteInDetail = tabulateElectionResults({
      store,
    })[GROUP_KEY_ROOT];
    assert(initialResultsWithoutWriteInDetail);

    // verify details of the results without write-in detail
    expect(initialResultsWithoutWriteInDetail.cardCounts).toEqual({
      bmd: 0,
      hmpb: [184],
    });

    const candidateContestId =
      'State-Representatives-Hillsborough-District-34-b1012d38';
    const yesNoContestId =
      'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';

    expect(
      initialResultsWithoutWriteInDetail.contestResults[candidateContestId]
    ).toEqual({
      ballots: 184,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 30,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 56,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 56,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 56,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 56,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 58,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 60,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 56,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 56,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 56,
        },
      },
      undervotes: 12,
      votesAllowed: 3,
    });

    expect(
      initialResultsWithoutWriteInDetail.contestResults[yesNoContestId]
    ).toEqual({
      ballots: 184,
      contestId:
        'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
      contestType: 'yesno',
      noTally: 2,
      overvotes: 2,
      undervotes: 178,
      yesTally: 2,
    });

    // since there has been no write-in adjudication yet, the result should the
    // same if we include write-in adjudication data
    const initialResultsWithWriteInDetail = tabulateElectionResults({
      store,
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(initialResultsWithWriteInDetail);
    expect(initialResultsWithWriteInDetail).toEqual(
      initialResultsWithoutWriteInDetail
    );

    // now generate some write-in adjudication data
    const writeIns = store.getWriteInRecords({
      electionId,
      contestId: candidateContestId,
      status: 'pending',
    });
    const [writeIn1, writeIn2, writeIn3, writeIn4, writeIn5, writeIn6] =
      writeIns;
    store.adjudicateWriteIn({
      writeInId: writeIn1!.id,
      type: 'invalid',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn2!.id,
      type: 'invalid',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn3!.id,
      type: 'official-candidate',
      candidateId: 'Obadiah-Carrigan-5c95145a',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn4!.id,
      type: 'official-candidate',
      candidateId: 'Abigail-Bartlett-4e46c9d4',
    });
    const writeInCandidate1 = store.addWriteInCandidate({
      electionId,
      contestId: candidateContestId,
      name: 'Mr. Pickles',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn5!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate1.id,
    });
    const writeInCandidate2 = store.addWriteInCandidate({
      electionId,
      contestId: candidateContestId,
      name: 'Ms. Tomato',
    });
    store.adjudicateWriteIn({
      writeInId: writeIn6!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate2.id,
    });

    // verify the results are modified with write-in data appropriately
    const modifiedResults = tabulateElectionResults({
      store,
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(modifiedResults);
    expect(modifiedResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [184],
    });
    expect(modifiedResults.contestResults[candidateContestId]).toEqual({
      ballots: 184,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 30,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 57,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 56,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 56,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 56,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 58,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 61,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 56,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 56,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 50,
        },
        [writeInCandidate1.id]: {
          id: writeInCandidate1.id,
          isWriteIn: true,
          name: 'Mr. Pickles',
          tally: 1,
        },
        [writeInCandidate2.id]: {
          id: writeInCandidate2.id,
          isWriteIn: true,
          name: 'Ms. Tomato',
          tally: 1,
        },
      },
      undervotes: 14,
      votesAllowed: 3,
    });
  });

  test('grouping & filtering by voting method', async () => {
    const store = Store.memoryStore();

    const { electionDefinition, castVoteRecordReport } =
      electionGridLayoutNewHampshireAmherstFixtures;
    const electionId = store.addElection(electionDefinition.electionData);
    store.setCurrentElectionId(electionId);

    const addReportResult = await addCastVoteRecordReport({
      store,
      reportDirectoryPath: castVoteRecordReport.asDirectoryPath(),
      exportedTimestamp: new Date().toISOString(),
      artifactAuthenticator: buildMockArtifactAuthenticator(),
    });
    const { id: fileId } = addReportResult.unsafeUnwrap();

    expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

    const candidateContestId =
      'State-Representatives-Hillsborough-District-34-b1012d38';
    const yesNoContestId =
      'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc';

    // check filtered absentee results
    const absenteeResults = tabulateElectionResults({
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(absenteeResults);
    expect(absenteeResults.cardCounts).toEqual({
      bmd: 0,
      hmpb: [92],
    });
    expect(absenteeResults.contestResults[yesNoContestId]).toEqual({
      ballots: 92,
      contestId:
        'Shall-there-be-a-convention-to-amend-or-revise-the-constitution--15e8b5bc',
      contestType: 'yesno',
      noTally: 1,
      overvotes: 1,
      undervotes: 89,
      yesTally: 1,
    });
    expect(absenteeResults.contestResults[candidateContestId]).toEqual({
      ballots: 92,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 15,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 28,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 28,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 28,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 28,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 29,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 30,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 28,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 28,
        },
        'write-in': {
          id: 'write-in',
          isWriteIn: true,
          name: 'Write-In',
          tally: 28,
        },
      },
      undervotes: 6,
      votesAllowed: 3,
    });

    // filtered precinct results should look the same, based on fixture
    const precinctResults = tabulateElectionResults({
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(precinctResults);
    expect(absenteeResults).toEqual(precinctResults);

    // grouped by voting method results should be the same as when simply filtered
    const resultsGroupedByVotingMethod = tabulateElectionResults({
      store,
      groupBy: { groupByVotingMethod: true },
      includeWriteInAdjudicationResults: true,
    });
    expect(resultsGroupedByVotingMethod['root&absentee']).toEqual({
      votingMethod: 'absentee',
      ...absenteeResults,
    });
    expect(resultsGroupedByVotingMethod['root&precinct']).toEqual({
      votingMethod: 'precinct',
      ...precinctResults,
    });

    // generate write-in adjudication data to test filtering
    const writeIns = store.getWriteInRecords({
      electionId,
      contestId: candidateContestId,
      status: 'pending',
    });
    expect(writeIns.length).toEqual(56);
    for (const writeIn of writeIns) {
      store.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'invalid',
      });
    }

    // check absentee results after invalidating write-ins
    const absenteeResultsAdjudicated = tabulateElectionResults({
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(absenteeResultsAdjudicated);
    expect(
      absenteeResultsAdjudicated.contestResults[candidateContestId]
    ).toEqual({
      ballots: 92,
      contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
      contestType: 'candidate',
      overvotes: 15,
      tallies: {
        'Abigail-Bartlett-4e46c9d4': {
          id: 'Abigail-Bartlett-4e46c9d4',
          name: 'Abigail Bartlett',
          tally: 28,
        },
        'Elijah-Miller-a52e6988': {
          id: 'Elijah-Miller-a52e6988',
          name: 'Elijah Miller',
          tally: 28,
        },
        'Isaac-Hill-d6c9deeb': {
          id: 'Isaac-Hill-d6c9deeb',
          name: 'Isaac Hill',
          tally: 28,
        },
        'Jacob-Freese-b5146505': {
          id: 'Jacob-Freese-b5146505',
          name: 'Jacob Freese',
          tally: 28,
        },
        'Mary-Baker-Eddy-350785d5': {
          id: 'Mary-Baker-Eddy-350785d5',
          name: 'Mary Baker Eddy',
          tally: 29,
        },
        'Obadiah-Carrigan-5c95145a': {
          id: 'Obadiah-Carrigan-5c95145a',
          name: 'Obadiah Carrigan',
          tally: 30,
        },
        'Samuel-Bell-17973275': {
          id: 'Samuel-Bell-17973275',
          name: 'Samuel Bell',
          tally: 28,
        },
        'Samuel-Livermore-f927fef1': {
          id: 'Samuel-Livermore-f927fef1',
          name: 'Samuel Livermore',
          tally: 28,
        },
      },
      undervotes: 34,
      votesAllowed: 3,
    });

    // check results filtered by precinct voting method
    const precinctResultsAdjudicated = tabulateElectionResults({
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
    })[GROUP_KEY_ROOT];
    assert(precinctResultsAdjudicated);
    expect(absenteeResultsAdjudicated).toEqual(precinctResultsAdjudicated);

    // check the grouped results
    const adjudicatedResultsByVotingMethod = tabulateElectionResults({
      store,
      groupBy: { groupByVotingMethod: true },
      includeWriteInAdjudicationResults: true,
    });
    expect(adjudicatedResultsByVotingMethod['root&absentee']).toEqual({
      votingMethod: 'absentee',
      ...absenteeResultsAdjudicated,
    });
    expect(adjudicatedResultsByVotingMethod['root&precinct']).toEqual({
      votingMethod: 'precinct',
      ...precinctResultsAdjudicated,
    });
  });
});
