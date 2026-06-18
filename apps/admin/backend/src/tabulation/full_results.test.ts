import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionStraightPartyFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildElectionResultsFixture,
  buildManualResultsFixture,
  getFeatureFlagMock,
  getGroupKey,
} from '@votingworks/utils';
import { assert, assertDefined } from '@votingworks/basics';
import {
  anyPollingPlace,
  BallotIdSchema,
  BallotStyleGroupId,
  BallotType,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  getContests,
  InterpretedBmdPage,
  Tabulation,
  unsafeParse,
  VotesDict,
} from '@votingworks/types';
import {
  buildCastVoteRecord,
  writeCastVoteRecordExport,
} from '@votingworks/backend';
import { BaseLogger, mockBaseLogger } from '@votingworks/logging';
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
import { adjudicateCvr } from '../adjudication';
import { AdjudicatedContestOption, WriteInRecord } from '../types';

const GROUP_KEY = getGroupKey({}, {});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.EARLY_VOTING
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

/**
 * Adjudicates a single write-in through {@link adjudicateCvr}.
 * Only the target write-in option is specified; other options retain
 * their scanned votes.
 */
function adjudicateWriteIn({
  store,
  contestId,
  writeIn,
  adjudicatedOption,
  logger,
}: {
  store: Store;
  contestId: string;
  writeIn: WriteInRecord;
  adjudicatedOption: AdjudicatedContestOption;
  logger: BaseLogger;
}): void {
  adjudicateCvr(
    {
      cvrId: writeIn.cvrId,
      contests: [
        {
          adjudicatedContestOptionById: {
            [writeIn.optionId]: adjudicatedOption,
          },
          contestId,
        },
      ],
    },
    'test-machine',
    store,
    logger
  );
}

test('tabulateCastVoteRecords', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleGroupId: '1M',
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
        bmd: fishingTally > 0 ? [fishingTally] : [],
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
      expected: [['{}', 83]],
    },
    // each filter case
    {
      filter: { precinctIds: ['precinct-2'] },
      expected: [['{}', 55]],
    },
    {
      filter: { scannerIds: ['scanner-2'] },
      expected: [['{}', 21]],
    },
    {
      filter: { batchIds: ['batch-2-1', 'batch-3-1'] },
      expected: [['{}', 43]],
    },
    {
      filter: { votingMethods: ['precinct'] },
      expected: [['{}', 68]],
    },
    {
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      expected: [['{}', 45]],
    },
    {
      filter: { partyIds: ['0'] },
      expected: [['{}', 45]],
    },
    // empty filter case
    {
      filter: { partyIds: [] },
      expected: [['{}', 0]],
    },
    // trivial filter case
    {
      filter: { partyIds: ['0', '1'] },
      expected: [['{}', 83]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['{"ballotStyleGroupId":"1M"}', 45],
        ['{"ballotStyleGroupId":"2F"}', 38],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['{"partyId":"0"}', 45],
        ['{"partyId":"1"}', 38],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['{"batchId":"batch-1-1"}', 11],
        ['{"batchId":"batch-1-2"}', 17],
        ['{"batchId":"batch-2-1"}', 9],
        ['{"batchId":"batch-2-2"}', 12],
        ['{"batchId":"batch-3-1"}', 34],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['{"scannerId":"scanner-1"}', 28],
        ['{"scannerId":"scanner-2"}', 21],
        ['{"scannerId":"scanner-3"}', 34],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['{"precinctId":"precinct-1"}', 28],
        ['{"precinctId":"precinct-2"}', 55],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['{"votingMethod":"early_voting"}', 0],
        ['{"votingMethod":"precinct"}', 68],
        ['{"votingMethod":"absentee"}', 15],
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
  const store = Store.memoryStore(makeTemporaryDirectory());
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const groupedElectionResults = await tabulateCastVoteRecords({
    electionId,
    store,
    groupBy: { groupByPrecinct: true, groupByVotingMethod: true },
  });
  expect(Object.keys(groupedElectionResults)).toEqual([
    '{"precinctId":"precinct-1","votingMethod":"early_voting"}',
    '{"precinctId":"precinct-1","votingMethod":"precinct"}',
    '{"precinctId":"precinct-1","votingMethod":"absentee"}',
    '{"precinctId":"precinct-2","votingMethod":"early_voting"}',
    '{"precinctId":"precinct-2","votingMethod":"precinct"}',
    '{"precinctId":"precinct-2","votingMethod":"absentee"}',
  ]);
});

const candidateContestId =
  'State-Representatives-Hillsborough-District-34-b1012d38';

test('tabulateElectionResults - write-in handling', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });

  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const importResult = await importCastVoteRecords(
    store,
    castVoteRecordExport.asDirectoryPath(),
    logger
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
  )[GROUP_KEY];
  assert(overallResultsPreAdjudication);

  const partialExpectedResultsPreAdjudication = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: [],
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
  const adjudicateArgs = {
    store,
    contestId: candidateContestId,
    logger,
  } as const;
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn1!,
    adjudicatedOption: { type: 'write-in-option', hasVote: false },
  });
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn2!,
    adjudicatedOption: { type: 'write-in-option', hasVote: false },
  });
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn3!,
    adjudicatedOption: {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'Obadiah-Carrigan-5c95145a',
      candidateType: 'official-candidate',
    },
  });
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn4!,
    adjudicatedOption: {
      type: 'write-in-option',
      hasVote: true,
      candidateId: 'Abigail-Bartlett-4e46c9d4',
      candidateType: 'official-candidate',
    },
  });
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn5!,
    adjudicatedOption: {
      type: 'write-in-option',
      hasVote: true,
      candidateName: 'Mr. Pickles',
      candidateType: 'write-in-candidate',
    },
  });
  adjudicateWriteIn({
    ...adjudicateArgs,
    writeIn: writeIn6!,
    adjudicatedOption: {
      type: 'write-in-option',
      hasVote: true,
      candidateName: 'Ms. Tomato',
      candidateType: 'write-in-candidate',
    },
  });
  const writeInCandidate1 = store
    .getWriteInCandidates({ electionId, contestIds: [candidateContestId] })
    .find((c) => c.name === 'Mr. Pickles');
  assert(writeInCandidate1 !== undefined);
  const writeInCandidate2 = store
    .getWriteInCandidates({ electionId, contestIds: [candidateContestId] })
    .find((c) => c.name === 'Ms. Tomato');
  assert(writeInCandidate2 !== undefined);

  // if we don't specify we need the detailed WIA data, undervotes still reflect the invalid write-ins
  const overallResultsScreenWiaNoDetail = (
    await tabulateElectionResults({
      electionId,
      store,
    })
  )[GROUP_KEY];
  assert(overallResultsScreenWiaNoDetail);
  const partialExpectedResultsScreenWiaNoDetail = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: [],
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
  )[GROUP_KEY];
  assert(overallResultsScreenWiaDetail);

  const partialExpectedResultsScreenWiaDetail = buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: [],
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
    ballotStyleGroupId: election.ballotStyles[0]!.groupId,
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
  )[GROUP_KEY];
  assert(overallResultsScreenAndManualWiaDetail);

  const partialExpectedResultsScreenAndManualWiaDetail =
    buildElectionResultsFixture({
      election,
      cardCounts: {
        bmd: [],
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
  )[GROUP_KEY];
  assert(overallResultsScreenAndManualWiaNoDetail);

  const partialExpectedResultsScreenAndManualWiaNoDetail =
    buildElectionResultsFixture({
      election,
      cardCounts: {
        bmd: [],
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
  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election, electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);
  const importResult = await importCastVoteRecords(
    store,
    castVoteRecordExport.asDirectoryPath(),
    logger
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
    adjudicateWriteIn({
      store,
      contestId: candidateContestId,
      writeIn,
      adjudicatedOption: { type: 'write-in-option', hasVote: false },
      logger,
    });
  }

  // check absentee results, should have received half of the adjudicated as invalid write-ins
  const absenteeResults = (
    await tabulateElectionResults({
      electionId,
      store,
      filter: { votingMethods: ['absentee'] },
      includeWriteInAdjudicationResults: true,
    })
  )[GROUP_KEY];
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
      bmd: [],
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
  )[GROUP_KEY];
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
  const absenteeResultsGroup = groupedResults['{"votingMethod":"absentee"}'];
  const precinctResultsGroup = groupedResults['{"votingMethod":"precinct"}'];
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
    ballotStyleGroupId: election.ballotStyles[0]!.groupId,
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
  )[GROUP_KEY];
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
      bmd: [],
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
  )[GROUP_KEY];
  assert(precinctResultsWithManual);

  expect(precinctResultsWithManual.cardCounts).toEqual({
    bmd: [],
    hmpb: [92],
    manual: 0,
  });
  expect(precinctResultsWithManual.contestResults[candidateContestId]).toEqual(
    partialExpectedResults.contestResults[candidateContestId]
  );
});

test('tabulateElectionResults - imports and derives straight-party votes', async () => {
  const electionDefinition =
    electionStraightPartyFixtures.readElectionDefinition();
  const { election, ballotHash } = electionDefinition;
  const ballotStyle = assertDefined(
    election.ballotStyles.find((bs) => bs.id === '5')
  );
  const precinctId = assertDefined(ballotStyle.precincts[0]);

  function blankVotes(): VotesDict {
    return Object.fromEntries(
      getContests({ ballotStyle, election }).map((contest) => [contest.id, []])
    );
  }

  function buildStraightPartyCvr(id: string, votes: VotesDict): CVR.CVR {
    const ballotId = unsafeParse(BallotIdSchema, id);
    const interpretation: InterpretedBmdPage = {
      type: 'InterpretedBmdPage',
      metadata: {
        ballotHash,
        precinctId,
        ballotStyleId: ballotStyle.id,
        isTestMode: true,
        ballotType: BallotType.Precinct,
        pageNumber: 1,
        totalPages: 1,
        ballotAuditId: ballotId,
        contestIds: [],
      },
      votes,
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
    };
    return buildCastVoteRecord({
      electionDefinition,
      electionId: ballotHash,
      scannerId: 'VX-00-000',
      castVoteRecordId: ballotId,
      batchId: 'batch-1',
      ballotMarkingMode: 'machine',
      interpretation,
    });
  }

  // Only vote the straight-party contest, letting the other partisan contest
  // votes be derived.
  const exportDirectoryPath = makeTemporaryDirectory();
  const castVoteRecords = [
    buildStraightPartyCvr('cvr-1', {
      ...blankVotes(),
      'straight-party-ticket': ['0'],
    }),
    buildStraightPartyCvr('cvr-2', {
      ...blankVotes(),
      'straight-party-ticket': ['0'],
    }),
    buildStraightPartyCvr('cvr-3', {
      ...blankVotes(),
      'straight-party-ticket': ['1'],
    }),
  ];

  await writeCastVoteRecordExport({
    exportDirectoryPath,
    electionDefinition,
    castVoteRecords: castVoteRecords.map((castVoteRecord) => ({
      castVoteRecord,
    })),
    pollingPlaceId: anyPollingPlace(election).id,
    isTestMode: true,
  });

  const store = Store.memoryStore(makeTemporaryDirectory());
  const logger = mockBaseLogger({ fn: vi.fn });
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const importResult = await importCastVoteRecords(
    store,
    exportDirectoryPath,
    logger
  );
  const { id: fileId } = importResult.unsafeUnwrap();
  expect(store.getCastVoteRecordCountByFileId(fileId)).toEqual(3);

  const results = (await tabulateElectionResults({ electionId, store }))[
    GROUP_KEY
  ];
  assert(results);

  const expectedResults = buildElectionResultsFixture({
    election,
    cardCounts: { bmd: [3], hmpb: [] },
    contestResultsSummaries: {
      'straight-party-ticket': {
        type: 'straight-party',
        ballots: 3,
        optionTallies: { '0': 2, '1': 1 },
      },
      president: {
        type: 'candidate',
        ballots: 3,
        officialOptionTallies: { 'barchi-hallaren': 2, 'cramer-vuocolo': 1 },
      },
    },
    includeGenericWriteIn: true,
  });

  expect(results.contestResults['straight-party-ticket']).toEqual(
    expectedResults.contestResults['straight-party-ticket']
  );
  expect(results.contestResults['president']).toEqual(
    expectedResults.contestResults['president']
  );
});
