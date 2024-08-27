import { Buffer } from 'buffer';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  GROUP_KEY_ROOT,
  buildElectionResultsFixture,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assert } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { fakeLogger } from '@votingworks/logging';
import {
  tabulateCastVoteRecords,
  tabulateElectionResults,
} from './full_results';
import { Store } from '../store';
import { importCastVoteRecords } from '../cast_vote_records';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import { adjudicateWriteIn } from '../adjudication';

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
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('tabulateCastVoteRecords', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
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
    expected: Array<[groupKey: Tabulation.GroupKey, tally: number]>;
  }> = [
    // no filter case
    {
      expected: [['root', 83]],
    },
    // each filter case
    {
      filter: { precinctIds: ['precinct-2'] },
      expected: [['root', 55]],
    },
    {
      filter: { scannerIds: ['scanner-2'] },
      expected: [['root', 21]],
    },
    {
      filter: { batchIds: ['batch-2-1', 'batch-3-1'] },
      expected: [['root', 43]],
    },
    {
      filter: { votingMethods: ['precinct'] },
      expected: [['root', 68]],
    },
    {
      filter: { ballotStyleIds: ['1M'] },
      expected: [['root', 45]],
    },
    {
      filter: { partyIds: ['0'] },
      expected: [['root', 45]],
    },
    // empty filter case
    {
      filter: { partyIds: [] },
      expected: [['root', 0]],
    },
    // trivial filter case
    {
      filter: { partyIds: ['0', '1'] },
      expected: [['root', 83]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['root&ballotStyleId=1M', 45],
        ['root&ballotStyleId=2F', 38],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['root&partyId=0', 45],
        ['root&partyId=1', 38],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['root&batchId=batch-1-1', 11],
        ['root&batchId=batch-1-2', 17],
        ['root&batchId=batch-2-1', 9],
        ['root&batchId=batch-2-2', 12],
        ['root&batchId=batch-3-1', 34],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['root&scannerId=scanner-1', 28],
        ['root&scannerId=scanner-2', 21],
        ['root&scannerId=scanner-3', 34],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['root&precinctId=precinct-1', 28],
        ['root&precinctId=precinct-2', 55],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['root&votingMethod=precinct', 68],
        ['root&votingMethod=absentee', 15],
      ],
    },
  ];

  for (const { filter, groupBy, expected } of testCases) {
    const groupedElectionResults = await tabulateCastVoteRecords({
      electionId,
      store,
      filter,
      groupBy,
    });

    for (const [groupKey, tally] of expected) {
      expect(groupedElectionResults[groupKey]).toEqual(
        getMockElectionResults(tally)
      );
    }

    expect(Object.values(groupedElectionResults)).toHaveLength(expected.length);
  }
});

test('tabulateElectionResults - includes empty groups', async () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
  });
  store.setCurrentElectionId(electionId);

  const groupedElectionResults = await tabulateCastVoteRecords({
    electionId,
    store,
    groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
  });
  expect(Object.keys(groupedElectionResults)).toEqual([
    'root&precinctId=precinct-1&votingMethod=precinct',
    'root&precinctId=precinct-1&votingMethod=absentee',
    'root&precinctId=precinct-2&votingMethod=precinct',
    'root&precinctId=precinct-2&votingMethod=absentee',
  ]);
});

const candidateContestId =
  'State-Representatives-Hillsborough-District-34-9bcd590d';

test('tabulateElectionResults - write-in handling', async () => {
  const store = Store.memoryStore();
  const logger = fakeLogger();

  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
  });
  store.setCurrentElectionId(electionId);

  const importResult = await importCastVoteRecords(
    store,
    castVoteRecordExport.asDirectoryPath()
  );
  const { id: fileId } = importResult.unsafeUnwrap();
  expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

  /*  ******************* 
  /*   Pre-Adjudication, No WIA Data
  /*  ******************* */

  const overallResultsPreAdjudication = (
    await tabulateElectionResults({
      electionId,
      store,
    })
  )[GROUP_KEY_ROOT];
  assert(overallResultsPreAdjudication);

  const partialExpectedResultsPreAdjudication = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [184],
    },
    contestResultsSummaries: {
      [candidateContestId]: {
        type: 'candidate',
        ballots: 184,
        overvotes: 30,
        undervotes: 12,
        officialOptionTallies: {
          'Abigail-Bartlett-4e46c9d4': 56,
          'Elijah-Miller-a52e6988': 56,
          'Isaac-Hill-d6c9deeb': 56,
          'Jacob-Freese-b5146505': 56,
          'Mary-Baker-Eddy-350785d5': 58,
          'Obadiah-Carrigan-5c95145a': 60,
          'Samuel-Bell-17973275': 56,
          'Samuel-Livermore-f927fef1': 56,
          'write-in': 56,
        },
      },
    },
    includeGenericWriteIn: true,
  });

  expect(overallResultsPreAdjudication.cardCounts).toEqual(
    partialExpectedResultsPreAdjudication.cardCounts
  );
  expect(
    overallResultsPreAdjudication.contestResults[candidateContestId]
  ).toEqual(
    partialExpectedResultsPreAdjudication.contestResults[candidateContestId]
  );

  /*  ********************** 
  /*   With Screen WIA Data    
  /*  ********************** */

  // now let's add some "screen-adjudicated" write-in adjudication
  const writeIns = store.getWriteInRecords({
    electionId,
    contestId: candidateContestId,
  });
  const [writeIn1, writeIn2, writeIn3, writeIn4, writeIn5, writeIn6] = writeIns;
  await adjudicateWriteIn(
    {
      writeInId: writeIn1!.id,
      type: 'invalid',
    },
    store,
    logger
  );
  await adjudicateWriteIn(
    {
      writeInId: writeIn2!.id,
      type: 'invalid',
    },
    store,
    logger
  );
  await adjudicateWriteIn(
    {
      writeInId: writeIn3!.id,
      type: 'official-candidate',
      candidateId: 'Obadiah-Carrigan-5c95145a',
    },
    store,
    logger
  );
  await adjudicateWriteIn(
    {
      writeInId: writeIn4!.id,
      type: 'official-candidate',
      candidateId: 'Abigail-Bartlett-4e46c9d4',
    },
    store,
    logger
  );
  const writeInCandidate1 = store.addWriteInCandidate({
    electionId,
    contestId: candidateContestId,
    name: 'Mr. Pickles',
  });
  await adjudicateWriteIn(
    {
      writeInId: writeIn5!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate1.id,
    },
    store,
    logger
  );
  const writeInCandidate2 = store.addWriteInCandidate({
    electionId,
    contestId: candidateContestId,
    name: 'Ms. Tomato',
  });
  await adjudicateWriteIn(
    {
      writeInId: writeIn6!.id,
      type: 'write-in-candidate',
      candidateId: writeInCandidate2.id,
    },
    store,
    logger
  );

  // if we don't specify we need the detailed WIA data, undervotes still reflect the invalid write-ins
  const overallResultsScreenWiaNoDetail = (
    await tabulateElectionResults({
      electionId,
      store,
    })
  )[GROUP_KEY_ROOT];
  assert(overallResultsScreenWiaNoDetail);
  const partialExpectedResultsScreenWiaNoDetail = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [184],
    },
    contestResultsSummaries: {
      [candidateContestId]: {
        type: 'candidate',
        ballots: 184,
        overvotes: 30,
        undervotes: 14,
        officialOptionTallies: {
          'Abigail-Bartlett-4e46c9d4': 56,
          'Elijah-Miller-a52e6988': 56,
          'Isaac-Hill-d6c9deeb': 56,
          'Jacob-Freese-b5146505': 56,
          'Mary-Baker-Eddy-350785d5': 58,
          'Obadiah-Carrigan-5c95145a': 60,
          'Samuel-Bell-17973275': 56,
          'Samuel-Livermore-f927fef1': 56,
          'write-in': 54,
        },
      },
    },
    includeGenericWriteIn: true,
  });
  expect(overallResultsScreenWiaNoDetail.cardCounts).toEqual(
    partialExpectedResultsScreenWiaNoDetail.cardCounts
  );
  expect(
    overallResultsScreenWiaNoDetail.contestResults[candidateContestId]
  ).toEqual(
    partialExpectedResultsScreenWiaNoDetail.contestResults[candidateContestId]
  );

  const overallResultsScreenWiaDetail = (
    await tabulateElectionResults({
      electionId,
      store,
      includeWriteInAdjudicationResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(overallResultsScreenWiaDetail);

  const partialExpectedResultsScreenWiaDetail = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [184],
    },
    contestResultsSummaries: {
      [candidateContestId]: {
        type: 'candidate',
        ballots: 184,
        overvotes: 30,
        undervotes: 14,
        officialOptionTallies: {
          'Abigail-Bartlett-4e46c9d4': 57,
          'Elijah-Miller-a52e6988': 56,
          'Isaac-Hill-d6c9deeb': 56,
          'Jacob-Freese-b5146505': 56,
          'Mary-Baker-Eddy-350785d5': 58,
          'Obadiah-Carrigan-5c95145a': 61,
          'Samuel-Bell-17973275': 56,
          'Samuel-Livermore-f927fef1': 56,
        },
        writeInOptionTallies: {
          [writeInCandidate1.id]: {
            name: 'Mr. Pickles',
            tally: 1,
          },
          [writeInCandidate2.id]: {
            name: 'Ms. Tomato',
            tally: 1,
          },
          [Tabulation.PENDING_WRITE_IN_ID]: {
            name: Tabulation.PENDING_WRITE_IN_NAME,
            tally: 50,
          },
        },
      },
    },
    includeGenericWriteIn: false,
  });

  expect(overallResultsScreenWiaDetail.cardCounts).toEqual(
    overallResultsScreenWiaDetail.cardCounts
  );
  expect(
    overallResultsScreenWiaDetail.contestResults[candidateContestId]
  ).toEqual(
    partialExpectedResultsScreenWiaDetail.contestResults[candidateContestId]
  );

  /*  *******************************
  /*   With Screen + Manual WIA Data    
  /*  ******************************* */

  const manualOnlyWriteInCandidate = store.addWriteInCandidate({
    electionId,
    contestId: candidateContestId,
    name: 'New Kid',
  });

  store.setManualResults({
    electionId,
    precinctId: election.precincts[0]!.id,
    ballotStyleId: election.ballotStyles[0]!.id,
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 5,
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 5,
          overvotes: 0,
          undervotes: 0,
          writeInOptionTallies: {
            [writeInCandidate1.id]: {
              name: 'Mr. Pickles',
              tally: 3,
            },
            [manualOnlyWriteInCandidate.id]: {
              name: 'New Kid',
              tally: 2,
            },
          },
        },
      },
    }),
  });

  const overallResultsScreenAndManualWiaDetail = (
    await tabulateElectionResults({
      electionId,
      store,
      includeWriteInAdjudicationResults: true,
      includeManualResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(overallResultsScreenAndManualWiaDetail);

  const partialExpectedResultsScreenAndManualWiaDetail =
    buildElectionResultsFixture({
      election,
      cardCounts: {
        bmd: 0,
        hmpb: [184],
        manual: 5,
      },
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 189,
          overvotes: 30,
          undervotes: 14,
          officialOptionTallies: {
            'Abigail-Bartlett-4e46c9d4': 57,
            'Elijah-Miller-a52e6988': 56,
            'Isaac-Hill-d6c9deeb': 56,
            'Jacob-Freese-b5146505': 56,
            'Mary-Baker-Eddy-350785d5': 58,
            'Obadiah-Carrigan-5c95145a': 61,
            'Samuel-Bell-17973275': 56,
            'Samuel-Livermore-f927fef1': 56,
          },
          writeInOptionTallies: {
            [writeInCandidate1.id]: {
              name: 'Mr. Pickles',
              tally: 4,
            },
            [writeInCandidate2.id]: {
              name: 'Ms. Tomato',
              tally: 1,
            },
            [manualOnlyWriteInCandidate.id]: {
              name: 'New Kid',
              tally: 2,
            },
            [Tabulation.PENDING_WRITE_IN_ID]: {
              name: Tabulation.PENDING_WRITE_IN_NAME,
              tally: 50,
            },
          },
        },
      },
      includeGenericWriteIn: false,
    });

  expect(overallResultsScreenAndManualWiaDetail.cardCounts).toEqual(
    partialExpectedResultsScreenAndManualWiaDetail.cardCounts
  );
  expect(
    overallResultsScreenAndManualWiaDetail.contestResults[candidateContestId]
  ).toEqual(
    partialExpectedResultsScreenAndManualWiaDetail.contestResults[
      candidateContestId
    ]
  );

  /*  ***********************************************
  /*   With Screen + Manual WIA Data, Without Detail    
  /*  *********************************************** */

  const overallResultsScreenAndManualWiaNoDetail = (
    await tabulateElectionResults({
      electionId,
      store,
      includeManualResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(overallResultsScreenAndManualWiaNoDetail);

  const partialExpectedResultsScreenAndManualWiaNoDetail =
    buildElectionResultsFixture({
      election,
      cardCounts: {
        bmd: 0,
        hmpb: [184],
        manual: 5,
      },
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 189,
          overvotes: 30,
          undervotes: 14,
          officialOptionTallies: {
            'Abigail-Bartlett-4e46c9d4': 56,
            'Elijah-Miller-a52e6988': 56,
            'Isaac-Hill-d6c9deeb': 56,
            'Jacob-Freese-b5146505': 56,
            'Mary-Baker-Eddy-350785d5': 58,
            'Obadiah-Carrigan-5c95145a': 60,
            'Samuel-Bell-17973275': 56,
            'Samuel-Livermore-f927fef1': 56,
            'write-in': 59,
          },
        },
      },
      includeGenericWriteIn: true,
    });

  expect(overallResultsScreenAndManualWiaNoDetail.cardCounts).toEqual(
    partialExpectedResultsScreenAndManualWiaNoDetail.cardCounts
  );
  expect(
    overallResultsScreenAndManualWiaNoDetail.contestResults[candidateContestId]
  ).toEqual(
    partialExpectedResultsScreenAndManualWiaNoDetail.contestResults[
      candidateContestId
    ]
  );
});

test('tabulateElectionResults - group and filter by voting method', async () => {
  const store = Store.memoryStore();
  const logger = fakeLogger();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
  });
  store.setCurrentElectionId(electionId);
  const importResult = await importCastVoteRecords(
    store,
    castVoteRecordExport.asDirectoryPath()
  );
  const { id: fileId } = importResult.unsafeUnwrap();
  expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(184);

  // generate write-in adjudication data to confirm it is filtered
  const writeIns = store.getWriteInRecords({
    electionId,
    contestId: candidateContestId,
  });
  expect(writeIns.length).toEqual(56);
  for (const writeIn of writeIns) {
    await adjudicateWriteIn(
      {
        writeInId: writeIn.id,
        type: 'invalid',
      },
      store,
      logger
    );
  }

  // check absentee results, should have received half of the adjudicated as invalid write-ins
  const absenteeResults = (
    await tabulateElectionResults({
      electionId,
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(absenteeResults);

  const partialExpectedResults = buildElectionResultsFixture({
    election,
    contestResultsSummaries: {
      [candidateContestId]: {
        type: 'candidate',
        ballots: 92,
        overvotes: 15,
        undervotes: 34,
        officialOptionTallies: {
          'Abigail-Bartlett-4e46c9d4': 28,
          'Elijah-Miller-a52e6988': 28,
          'Isaac-Hill-d6c9deeb': 28,
          'Jacob-Freese-b5146505': 28,
          'Mary-Baker-Eddy-350785d5': 29,
          'Obadiah-Carrigan-5c95145a': 30,
          'Samuel-Bell-17973275': 28,
          'Samuel-Livermore-f927fef1': 28,
        },
      },
    },
    cardCounts: {
      bmd: 0,
      hmpb: [92],
    },
    includeGenericWriteIn: false,
  });

  expect(absenteeResults.cardCounts).toEqual(partialExpectedResults.cardCounts);
  expect(absenteeResults.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );

  // precinct results should match
  const precinctResults = (
    await tabulateElectionResults({
      electionId,
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(precinctResults);

  expect(precinctResults.cardCounts).toEqual(partialExpectedResults.cardCounts);
  expect(precinctResults.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );

  // results grouped by voting method should match, with group specifiers
  const groupedResults = await tabulateElectionResults({
    electionId,
    store,
    groupBy: { groupByVotingMethod: true },
    includeWriteInAdjudicationResults: true,
  });
  const absenteeResultsGroup = groupedResults['root&votingMethod=absentee'];
  const precinctResultsGroup = groupedResults['root&votingMethod=precinct'];
  assert(absenteeResultsGroup && precinctResultsGroup);

  expect(absenteeResultsGroup.cardCounts).toEqual(
    partialExpectedResults.cardCounts
  );
  expect(absenteeResultsGroup.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );

  expect(precinctResultsGroup.cardCounts).toEqual(
    partialExpectedResults.cardCounts
  );
  expect(precinctResultsGroup.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );

  // if we add manual data, it will be selectively incorporated
  store.setManualResults({
    electionId,
    precinctId: election.precincts[0]!.id,
    ballotStyleId: election.ballotStyles[0]!.id,
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        [candidateContestId]: {
          type: 'candidate',
          ballots: 10,
          overvotes: 0,
          undervotes: 0,
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 10,
          },
        },
      },
    }),
  });

  // check absentee results again, should now have manual results added
  const absenteeResultsWithManual = (
    await tabulateElectionResults({
      electionId,
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
      includeManualResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(absenteeResultsWithManual);

  const partialExpectedResultsWithManual = buildElectionResultsFixture({
    election,
    contestResultsSummaries: {
      [candidateContestId]: {
        type: 'candidate',
        ballots: 102,
        overvotes: 15,
        undervotes: 34,
        officialOptionTallies: {
          'Abigail-Bartlett-4e46c9d4': 28,
          'Elijah-Miller-a52e6988': 28,
          'Isaac-Hill-d6c9deeb': 28,
          'Jacob-Freese-b5146505': 28,
          'Mary-Baker-Eddy-350785d5': 29,
          'Obadiah-Carrigan-5c95145a': 40,
          'Samuel-Bell-17973275': 28,
          'Samuel-Livermore-f927fef1': 28,
        },
      },
    },
    cardCounts: {
      bmd: 0,
      hmpb: [92],
      manual: 10,
    },
    includeGenericWriteIn: false,
  });

  expect(absenteeResultsWithManual.cardCounts).toEqual(
    partialExpectedResultsWithManual.cardCounts
  );
  expect(absenteeResultsWithManual.contestResults[candidateContestId]).toEqual(
    partialExpectedResultsWithManual.contestResults[candidateContestId]
  );

  // check precinct results again, should be the same
  const precinctResultsWithManual = (
    await tabulateElectionResults({
      electionId,
      store,
      filter: { votingMethods: ['precinct'] },
      includeWriteInAdjudicationResults: true,
      includeManualResults: true,
    })
  )[GROUP_KEY_ROOT];
  assert(precinctResultsWithManual);

  expect(precinctResultsWithManual.cardCounts).toEqual({
    bmd: 0,
    hmpb: [92],
    manual: 0,
  });
  expect(precinctResultsWithManual.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );
});
