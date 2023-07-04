import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { assert, find } from '@votingworks/basics';
import { writeInCandidate } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

jest.setTimeout(60_000);

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

test('card counts', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      groupBy: { groupByPrecinct: true, groupByBallotStyle: true },
    })
  ).toMatchObject(
    expect.arrayContaining([
      {
        ballotStyleId: '1M',
        precinctId: 'precinct-1',
        bmd: 28,
        hmpb: [],
        manual: 10,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-1',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
      {
        ballotStyleId: '1M',
        precinctId: 'precinct-2',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
      {
        ballotStyleId: '2F',
        precinctId: 'precinct-2',
        bmd: 28,
        hmpb: [],
        manual: 0,
      },
    ])
  );
});

test('tally report data - overall report & write-ins', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';
  const officialCandidateId = 'Obadiah-Carrigan-5c95145a';

  // try overall election results
  const overallTallyReportResult = await apiClient.getResultsForTallyReports();
  expect(overallTallyReportResult).toHaveLength(1);
  const [overallTallyReport] = overallTallyReportResult;
  assert(overallTallyReport);
  expect(overallTallyReport.manualResults).toBeUndefined();
  expect(overallTallyReport.scannedResults.cardCounts).toMatchObject({
    bmd: 0,
    hmpb: [184],
  });
  expect(
    overallTallyReport.scannedResults.contestResults[writeInContestId]
  ).toMatchObject({
    ballots: 184,
    undervotes: 12,
    tallies: {
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        name: 'Obadiah Carrigan',
        tally: 60,
      },
      'write-in': {
        id: 'write-in',
        isWriteIn: true,
        name: 'Write-In',
        tally: 56,
      },
    },
  });

  // adjudicate some write-ins
  const unofficialCandidate = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate',
  });
  const writeIns = await apiClient.getWriteIns({
    contestId: writeInContestId,
  });
  expect(writeIns).toHaveLength(56);
  const NUM_INVALID = 24;
  const NUM_OFFICIAL = 16;
  const NUM_UNOFFICIAL = 56 - NUM_INVALID - NUM_OFFICIAL;
  for (const [i, writeIn] of writeIns.entries()) {
    if (i < NUM_INVALID) {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'invalid',
      });
    } else if (i < NUM_INVALID + NUM_OFFICIAL) {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'official-candidate',
        candidateId: officialCandidateId,
      });
    } else {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'write-in-candidate',
        candidateId: unofficialCandidate.id,
      });
    }
  }

  const overallTallyReportAdjudicatedResult =
    await apiClient.getResultsForTallyReports();
  expect(overallTallyReportAdjudicatedResult).toHaveLength(1);
  const [overallTallyReportAdjudicated] = overallTallyReportAdjudicatedResult;
  assert(overallTallyReportAdjudicated);
  expect(overallTallyReportAdjudicated.manualResults).toBeUndefined();
  expect(overallTallyReportAdjudicated.scannedResults.cardCounts).toMatchObject(
    {
      bmd: 0,
      hmpb: [184],
    }
  );
  expect(
    overallTallyReportAdjudicated.scannedResults.contestResults[
      writeInContestId
    ]
  ).toMatchObject({
    ballots: 184,
    undervotes: 12 + NUM_INVALID,
    tallies: {
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        name: 'Obadiah Carrigan',
        tally: 60 + NUM_OFFICIAL,
      },
      'write-in': {
        id: 'write-in',
        isWriteIn: true,
        name: 'Write-In',
        tally: NUM_UNOFFICIAL,
      },
    },
  });
});

test('tally report data - grouped report & manual data', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  // adjudicate all write-ins for unofficial candidate, to confirm that it is
  // represented as the generic write-in
  const unofficialCandidate = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate',
  });
  const writeIns = await apiClient.getWriteIns({
    contestId: writeInContestId,
  });
  expect(writeIns).toHaveLength(56);
  for (const writeIn of writeIns) {
    await apiClient.adjudicateWriteIn({
      writeInId: writeIn.id,
      type: 'write-in-candidate',
      candidateId: unofficialCandidate.id,
    });
  }

  // add manual results
  const absenteeManualResults = buildManualResultsFixture({
    election,
    ballotCount: 10,
    contestResultsSummaries: {
      [writeInContestId]: {
        type: 'candidate',
        ballots: 10,
        writeInOptionTallies: {
          [unofficialCandidate.id]: {
            tally: 10,
            name: unofficialCandidate.name,
          },
        },
      },
    },
  });
  await apiClient.setManualResults({
    precinctId: election.precincts[0]!.id,
    ballotStyleId: election.ballotStyles[0]!.id,
    votingMethod: 'absentee',
    manualResults: absenteeManualResults,
  });

  const votingMethodTallyReportResult =
    await apiClient.getResultsForTallyReports({
      groupBy: { groupByVotingMethod: true },
    });
  expect(votingMethodTallyReportResult).toHaveLength(2);
  const absenteeTallyReport = find(
    votingMethodTallyReportResult,
    (report) => report.votingMethod === 'absentee'
  );
  const precinctTallyReport = find(
    votingMethodTallyReportResult,
    (report) => report.votingMethod === 'precinct'
  );

  // scanned results should be the same
  expect(absenteeTallyReport.scannedResults).toEqual(
    precinctTallyReport.scannedResults
  );
  expect(absenteeTallyReport.scannedResults.cardCounts).toMatchObject({
    bmd: 0,
    hmpb: [92],
  });
  expect(
    absenteeTallyReport.scannedResults.contestResults[writeInContestId]
  ).toMatchObject({
    ballots: 92,
    undervotes: 6,
    tallies: {
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        name: 'Obadiah Carrigan',
        tally: 30,
      },
      'write-in': {
        id: 'write-in',
        isWriteIn: true,
        name: 'Write-In',
        tally: 28, // unofficial write-in candidate tally properly included here
      },
    },
  });

  expect(precinctTallyReport.manualResults).toBeUndefined();
  const returnedAbsenteeManualResults = absenteeTallyReport.manualResults;
  expect(returnedAbsenteeManualResults).toBeDefined();

  expect(returnedAbsenteeManualResults).toMatchObject(
    buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {
        [writeInContestId]: {
          type: 'candidate',
          ballots: 10,
          writeInOptionTallies: {
            [writeInCandidate.id]: {
              tally: 10,
              name: writeInCandidate.name,
            },
          },
        },
      },
    })
  );

  // with a filter incompatible with manual results, manual results should be undefined
  const batchVotingMethodTallyReportResult =
    await apiClient.getResultsForTallyReports({
      groupBy: { groupByBatch: true, groupByVotingMethod: true },
    });
  expect(batchVotingMethodTallyReportResult).toHaveLength(2);
  const batchPrecinctTallyReport = find(
    batchVotingMethodTallyReportResult,
    (report) => report.votingMethod === 'precinct'
  );

  // manual results not included
  expect(batchPrecinctTallyReport.manualResults).toBeUndefined();

  // scanned results still correct, correctly handling write-ins
  expect(batchPrecinctTallyReport.scannedResults).toEqual(
    precinctTallyReport.scannedResults
  );
});

test('election write-in adjudication summary', async () => {
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordReport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  const writeInContestId =
    'State-Representatives-Hillsborough-District-34-b1012d38';

  // initially, all pending
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {},
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 0,
    pendingTally: 56,
    totalTally: 56,
  });

  const writeIns = await apiClient.getWriteIns({
    contestId: writeInContestId,
  });

  const unofficialCandidate1 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 1',
  });

  // generate some adjudication information
  for (const [i, writeIn] of writeIns.entries()) {
    if (i < 24) {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'write-in-candidate',
        candidateId: unofficialCandidate1.id,
      });
    } else if (i < 48) {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'official-candidate',
        candidateId: 'Obadiah-Carrigan-5c95145a',
      });
    } else {
      await apiClient.adjudicateWriteIn({
        writeInId: writeIn.id,
        type: 'invalid',
      });
    }
  }

  // with scanned adjudication data
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {
      [unofficialCandidate1.id]: {
        id: unofficialCandidate1.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 1',
        tally: 24,
      },
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        isWriteIn: false,
        name: 'Obadiah Carrigan',
        tally: 24,
      },
    },
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 8,
    pendingTally: 0,
    totalTally: 56,
  });

  // add manual data
  const unofficialCandidate2 = await apiClient.addWriteInCandidate({
    contestId: writeInContestId,
    name: 'Unofficial Candidate 2',
  });
  await apiClient.setManualResults({
    ballotStyleId: 'card-number-3',
    votingMethod: 'precinct',
    precinctId: 'town-id-00701-precinct-id-',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 25,
      contestResultsSummaries: {
        [writeInContestId]: {
          type: 'candidate',
          ballots: 25,
          overvotes: 3,
          undervotes: 2,
          writeInOptionTallies: {
            [unofficialCandidate1.id]: {
              name: 'Unofficial Candidate 1',
              tally: 5,
            },
            [unofficialCandidate2.id]: {
              name: 'Unofficial Candidate 2',
              tally: 4,
            },
          },
          officialOptionTallies: {
            'Obadiah-Carrigan-5c95145a': 11,
          },
        },
      },
    }),
  });

  // now with manual data
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      writeInContestId
    ]
  ).toEqual({
    candidateTallies: {
      'Obadiah-Carrigan-5c95145a': {
        id: 'Obadiah-Carrigan-5c95145a',
        isWriteIn: false,
        name: 'Obadiah Carrigan',
        tally: 24, // official candidate tallies should be unaffected by manual results
      },
      [unofficialCandidate2.id]: {
        id: unofficialCandidate2.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 2',
        tally: 4, // includes manual tallies for write-in candidates
      },
      [unofficialCandidate1.id]: {
        id: unofficialCandidate1.id,
        isWriteIn: true,
        name: 'Unofficial Candidate 1',
        tally: 29, // includes manual tallies for write-in candidates
      },
    },
    contestId: 'State-Representatives-Hillsborough-District-34-b1012d38',
    invalidTally: 8,
    pendingTally: 0,
    totalTally: 65, // total should now include manual tally subtotal
  });
});
