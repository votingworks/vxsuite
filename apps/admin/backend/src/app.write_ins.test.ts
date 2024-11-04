import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { assert, find, typedAs } from '@votingworks/basics';
import { toDataUrl, loadImageData } from '@votingworks/image-utils';
import { join } from 'node:path';
import {
  BooleanEnvironmentVariableName,
  ContestResultsSummary,
  UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
  buildElectionResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { CVR, Id, Rect, Tabulation } from '@votingworks/types';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { ContestWriteInSummary } from '@votingworks/types/src/tabulation';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import {
  BmdWriteInImageView,
  HmpbWriteInImageView,
  WriteInAdjudicationContext,
  WriteInRecord,
} from './types';

jest.setTimeout(30_000);

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', () => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  jest.restoreAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('getWriteInAdjudicationQueue', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const allWriteIns = await apiClient.getWriteInAdjudicationQueue();
  expect(allWriteIns).toHaveLength(80);

  expect(
    await apiClient.getWriteInAdjudicationQueue({
      contestId: 'Sheriff-4243fe0b',
    })
  ).toHaveLength(2);

  // add another file, whose write-ins should end up at the end of the queue
  const secondReportPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (castVoteRecord) => ({
        ...castVoteRecord,
        UniqueId: `x-${castVoteRecord.UniqueId}`,
      }),
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: secondReportPath,
    })
  ).unsafeUnwrap();

  const allWriteInsDouble = await apiClient.getWriteInAdjudicationQueue();
  expect(allWriteInsDouble).toHaveLength(160);
  expect(allWriteInsDouble.slice(0, 80)).toEqual(allWriteIns);
});

test('getWriteInAdjudicationQueueMetadata', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestsWithWriteIns = electionDefinition.election.contests.filter(
    (contest) => contest.type === 'candidate' && contest.allowWriteIns
  );

  const allQueueMetadata =
    await apiClient.getWriteInAdjudicationQueueMetadata();
  expect(allQueueMetadata).toHaveLength(contestsWithWriteIns.length);
  assert(
    allQueueMetadata.every(
      (metadata) => metadata.totalTally === metadata.pendingTally
    )
  );

  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({
      contestId: 'Sheriff-4243fe0b',
    })
  ).toEqual([
    {
      contestId: 'Sheriff-4243fe0b',
      totalTally: 2,
      pendingTally: 2,
    },
  ]);
});

test('getWriteInAdjudicationContext', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath = manualCastVoteRecordExport.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });
  expect(writeInIds).toHaveLength(2);

  const [writeInIdA, writeInIdB] = writeInIds;
  assert(writeInIdA !== undefined && writeInIdB !== undefined);

  // check image of first write-in
  const writeInImageViewA = await apiClient.getWriteInImageView({
    writeInId: writeInIdA,
  });
  assert(writeInImageViewA);

  const writeInAdjudicationContextA =
    await apiClient.getWriteInAdjudicationContext({
      writeInId: writeInIdA,
    });
  assert(writeInAdjudicationContextA);

  expect(writeInAdjudicationContextA).toMatchObject(
    typedAs<Partial<WriteInAdjudicationContext>>({
      cvrVotes: expect.objectContaining({
        [contestId]: expect.arrayContaining(['Obadiah-Carrigan-5c95145a']),
      }),
      relatedWriteIns: [
        expect.objectContaining(
          typedAs<Partial<WriteInRecord>>({
            status: 'pending',
          })
        ),
      ],
    })
  );

  // adjudicate first write-in for an official candidate
  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdA,
    type: 'official-candidate',
    candidateId: 'Mary-Baker-Eddy-350785d5',
  });

  // check the second write-in detail view, which should show the just-adjudicated write-in
  const writeInAdjudicationContextB1 =
    await apiClient.getWriteInAdjudicationContext({
      writeInId: writeInIdB,
    });

  expect(writeInAdjudicationContextB1).toMatchObject(
    typedAs<Partial<WriteInAdjudicationContext>>({
      cvrVotes: expect.objectContaining({
        [contestId]: expect.arrayContaining(['Obadiah-Carrigan-5c95145a']),
      }),
      relatedWriteIns: [
        expect.objectContaining(
          typedAs<Partial<WriteInRecord>>({
            status: 'adjudicated',
            adjudicationType: 'official-candidate',
            candidateId: 'Mary-Baker-Eddy-350785d5',
          })
        ),
      ],
    })
  );

  // re-adjudicate the first write-in for a write-in candidate and expect the ids to change
  const { id: writeInCandidateId } = await apiClient.addWriteInCandidate({
    contestId,
    name: 'Bob Hope',
  });
  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdA,
    type: 'write-in-candidate',
    candidateId: writeInCandidateId,
  });
  const writeInAdjudicationContextB2 =
    await apiClient.getWriteInAdjudicationContext({
      writeInId: writeInIdB,
    });

  expect(writeInAdjudicationContextB2).toMatchObject(
    typedAs<Partial<WriteInAdjudicationContext>>({
      cvrVotes: expect.objectContaining({
        [contestId]: expect.arrayContaining(['Obadiah-Carrigan-5c95145a']),
      }),
      relatedWriteIns: [
        expect.objectContaining(
          typedAs<Partial<WriteInRecord>>({
            status: 'adjudicated',
            adjudicationType: 'write-in-candidate',
            candidateId: writeInCandidateId,
          })
        ),
      ],
    })
  );
});

test('getWriteInImageView on hmpb', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath = manualCastVoteRecordExport.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });
  expect(writeInIds).toHaveLength(2);

  const [writeInIdA, writeInIdB] = writeInIds;
  assert(writeInIdA !== undefined && writeInIdB !== undefined);

  // check image of first write-in
  const writeInImageViewA = await apiClient.getWriteInImageView({
    writeInId: writeInIdA,
  });
  assert(writeInImageViewA);

  const {
    imageUrl: actualImageUrl,
    ballotCoordinates: ballotCoordinatesA,
    contestCoordinates: contestCoordinatesA,
    writeInCoordinates: writeInCoordinatesA,
  } = writeInImageViewA as HmpbWriteInImageView;

  const expectedImage = await loadImageData(
    join(
      reportDirectoryPath,
      '864a2854-ee26-4223-8097-9633b7bed096',
      '864a2854-ee26-4223-8097-9633b7bed096-front.jpg'
    )
  );
  const expectedImageUrl = toDataUrl(expectedImage, 'image/jpeg');
  expect(actualImageUrl).toEqual(expectedImageUrl);

  const expectedBallotCoordinates: Rect = {
    height: expectedImage.height,
    width: expectedImage.width,
    x: 0,
    y: 0,
  };
  expect(ballotCoordinatesA).toEqual(expectedBallotCoordinates);
  const expectedContestCoordinates: Rect = {
    height: 374,
    width: 1161,
    x: 436,
    y: 1183,
  };
  expect(contestCoordinatesA).toEqual(expectedContestCoordinates);
  expect(writeInCoordinatesA).toMatchInlineSnapshot(`
    {
      "height": 140,
      "width": 270,
      "x": 1327,
      "y": 1274,
    }
  `);

  // check the second write-in image view, which should have the same image
  // but different writeInCoordinates
  const writeInImageViewB1 = await apiClient.getWriteInImageView({
    writeInId: writeInIdB,
  });

  // contest and ballot coordinates should be the same, but write-in coordinates are different
  const {
    ballotCoordinates: ballotCoordinatesB,
    contestCoordinates: contestCoordinatesB,
    writeInCoordinates: writeInCoordinatesB,
  } = writeInImageViewB1 as HmpbWriteInImageView;
  expect(ballotCoordinatesB).toEqual(expectedBallotCoordinates);
  expect(contestCoordinatesB).toEqual(expectedContestCoordinates);
  expect(writeInCoordinatesB).toMatchInlineSnapshot(`
    {
      "height": 138,
      "width": 269,
      "x": 1328,
      "y": 1366,
    }
  `);
});

test('getWriteInImageView on bmd', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'zoo-council-mammal';
  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });
  expect(writeInIds).toHaveLength(24);
  const [writeInIdA, writeInIdB] = writeInIds;
  assert(writeInIdA !== undefined && writeInIdB !== undefined);

  // check image of first write-in
  const writeInImageViewA = await apiClient.getWriteInImageView({
    writeInId: writeInIdA,
  });
  assert(writeInImageViewA);

  const { machineMarkedText: machineMarkedTextA } =
    writeInImageViewA as BmdWriteInImageView;

  expect(machineMarkedTextA).toEqual('Mock Write-In');

  // check the second write-in image view, which should have the same image
  // but different writeInCoordinates
  const writeInImageViewB1 = await apiClient.getWriteInImageView({
    writeInId: writeInIdB,
  });

  const { machineMarkedText: machineMarkedTextB } =
    writeInImageViewB1 as BmdWriteInImageView;
  expect(machineMarkedTextB).toEqual('Mock Write-In');
});

test('getFirstPendingWriteInId', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

  const writeInQueue = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });

  function adjudicateAtIndex(index: number) {
    return apiClient.adjudicateWriteIn({
      writeInId: writeInQueue[index]!,
      type: 'invalid',
    });
  }

  expect(await apiClient.getFirstPendingWriteInId({ contestId })).toEqual(
    writeInQueue[0]
  );

  await adjudicateAtIndex(0);
  expect(await apiClient.getFirstPendingWriteInId({ contestId })).toEqual(
    writeInQueue[1]
  );

  await adjudicateAtIndex(2);
  expect(await apiClient.getFirstPendingWriteInId({ contestId })).toEqual(
    writeInQueue[1]
  );

  await adjudicateAtIndex(1);
  expect(await apiClient.getFirstPendingWriteInId({ contestId })).toEqual(
    writeInQueue[3]
  );

  for (const [i] of writeInQueue.entries()) {
    await adjudicateAtIndex(i);
  }
  expect(await apiClient.getFirstPendingWriteInId({ contestId })).toEqual(null);
});

test('handling unmarked write-ins', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  // modify the write-ins for a contest to be unmarked write-ins
  const WRITE_IN_CONTEST_ID = 'Governor-061a401b';
  const OFFICIAL_CANDIDATE_ID = 'Hannah-Dustin-ab4ef7c8';
  const exportDirectoryPath = await modifyCastVoteRecordExport(
    castVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Modified
        );

        const writeInContest = snapshot.CVRContest.find(
          (c) => c.ContestId === WRITE_IN_CONTEST_ID
        );
        if (writeInContest) {
          const selectionPosition = writeInContest.CVRContestSelection.find(
            (sel) => sel.SelectionPosition[0]?.CVRWriteIn
          )?.SelectionPosition[0];
          if (selectionPosition) {
            writeInContest.WriteIns = 0;
            writeInContest.Undervotes = 1;
            selectionPosition.HasIndication = CVR.IndicationStatus.No;
            selectionPosition.IsAllocable = CVR.AllocationStatus.Unknown;
            selectionPosition.Status = [CVR.PositionStatus.Other];
            selectionPosition.OtherStatus =
              UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS;
          }
        }

        return cvr;
      },
    }
  );

  const addTestFileResult = await apiClient.addCastVoteRecordFile({
    path: exportDirectoryPath,
  });
  assert(addTestFileResult.isOk());

  const [writeInId] = await apiClient.getWriteInAdjudicationQueue({
    contestId: WRITE_IN_CONTEST_ID,
  });
  assert(writeInId !== undefined);

  // check that the unmarked status appears in the write-in adjudication context
  const writeInContext = await apiClient.getWriteInAdjudicationContext({
    writeInId,
  });
  expect(writeInContext.writeIn.isUnmarked).toEqual(true);

  async function expectContestResults(
    contestSummary: ContestResultsSummary
  ): Promise<void> {
    const expectedResults = buildElectionResultsFixture({
      election,
      contestResultsSummaries: { [WRITE_IN_CONTEST_ID]: contestSummary },
      cardCounts: {
        bmd: 0,
        hmpb: [contestSummary.ballots],
      },
      includeGenericWriteIn: false,
    });
    expect(
      (await apiClient.getResultsForTallyReports())[0]?.scannedResults
        .contestResults[WRITE_IN_CONTEST_ID]
    ).toEqual(expectedResults.contestResults[WRITE_IN_CONTEST_ID]);
  }

  async function expectWriteInSummary(
    summary: Partial<ContestWriteInSummary>
  ): Promise<void> {
    expect(
      (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
        WRITE_IN_CONTEST_ID
      ]
    ).toMatchObject(summary);
  }

  // UWIs should appear in the write-in summary, but not in the tally results
  await expectWriteInSummary({
    pendingTally: 2,
    invalidTally: 0,
    totalTally: 2,
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 4,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
  });

  // a UWI should be reflected in tallies if we mark it as valid
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'official-candidate',
    candidateId: OFFICIAL_CANDIDATE_ID,
  });
  await expectWriteInSummary({
    pendingTally: 1,
    invalidTally: 0,
    totalTally: 2,
    candidateTallies: {
      [OFFICIAL_CANDIDATE_ID]: {
        id: OFFICIAL_CANDIDATE_ID,
        name: 'Hannah Dustin',
        tally: 1,
      },
    },
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 3,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 3,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
  });

  // an invalid UWI should appear the same as unadjudicated in tallies
  await apiClient.adjudicateWriteIn({
    writeInId,
    type: 'invalid',
  });
  await expectWriteInSummary({
    pendingTally: 1,
    invalidTally: 1,
    totalTally: 2,
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 4,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
  });
});

test('adjudicating write-ins changes their status and is reflected in tallies', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const { election } = electionDefinition;
  await configureMachine(apiClient, auth, electionDefinition);
  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'Governor-061a401b';
  const writeInIds = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });
  expect(writeInIds).toHaveLength(2);
  const writeInId = writeInIds[0]!;

  async function expectContestResults(
    contestSummary: ContestResultsSummary
  ): Promise<void> {
    const expectedResults = buildElectionResultsFixture({
      election,
      contestResultsSummaries: { [contestId]: contestSummary },
      cardCounts: {
        bmd: 0,
        hmpb: [contestSummary.ballots],
      },
      includeGenericWriteIn: false,
    });
    expect(
      (await apiClient.getResultsForTallyReports())[0]?.scannedResults
        .contestResults[contestId]
    ).toEqual(expectedResults.contestResults[contestId]);
  }

  async function expectWriteInSummary(
    summary: ContestWriteInSummary
  ): Promise<void> {
    expect(
      (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
        contestId
      ]
    ).toEqual(summary);
  }

  async function expectWriteInRecord(
    id: Id,
    expected: Partial<WriteInRecord>
  ): Promise<void> {
    expect(
      (await apiClient.getWriteInAdjudicationContext({ writeInId: id })).writeIn
    ).toMatchObject(expected);
  }

  // unadjudicated results
  await expectWriteInRecord(writeInId, {
    status: 'pending',
  });
  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 2,
      totalTally: 2,
    },
  ]);
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 2,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
    writeInOptionTallies: {
      [Tabulation.PENDING_WRITE_IN_ID]: {
        name: Tabulation.PENDING_WRITE_IN_NAME,
        tally: 2,
      },
    },
  });
  await expectWriteInSummary({
    candidateTallies: {},
    contestId: 'Governor-061a401b',
    invalidTally: 0,
    pendingTally: 2,
    totalTally: 2,
  });

  // check invalid
  await apiClient.adjudicateWriteIn({
    type: 'invalid',
    writeInId,
  });
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 3,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
    writeInOptionTallies: {
      [Tabulation.PENDING_WRITE_IN_ID]: {
        name: Tabulation.PENDING_WRITE_IN_NAME,
        tally: 1,
      },
    },
  });
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      contestId
    ]
  ).toEqual({
    candidateTallies: {},
    contestId: 'Governor-061a401b',
    invalidTally: 1,
    pendingTally: 1,
    totalTally: 2,
  });

  // check official candidate
  await apiClient.adjudicateWriteIn({
    type: 'official-candidate',
    candidateId: 'Hannah-Dustin-ab4ef7c8',
    writeInId,
  });
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'official-candidate',
    candidateId: 'Hannah-Dustin-ab4ef7c8',
    status: 'adjudicated',
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 2,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 3,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
    writeInOptionTallies: {
      [Tabulation.PENDING_WRITE_IN_ID]: {
        name: Tabulation.PENDING_WRITE_IN_NAME,
        tally: 1,
      },
    },
  });
  await expectWriteInSummary({
    contestId: 'Governor-061a401b',
    invalidTally: 0,
    pendingTally: 1,
    totalTally: 2,
    candidateTallies: {
      'Hannah-Dustin-ab4ef7c8': {
        id: 'Hannah-Dustin-ab4ef7c8',
        isWriteIn: false,
        name: 'Hannah Dustin',
        tally: 1,
      },
    },
  });

  // check unofficial candidate
  const writeInCandidate = await apiClient.addWriteInCandidate({
    contestId,
    name: 'Mr. Hero',
  });
  await apiClient.adjudicateWriteIn({
    type: 'write-in-candidate',
    candidateId: writeInCandidate.id,
    writeInId,
  });
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'write-in-candidate',
    candidateId: writeInCandidate.id,
    status: 'adjudicated',
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 2,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
    writeInOptionTallies: {
      [Tabulation.PENDING_WRITE_IN_ID]: {
        name: Tabulation.PENDING_WRITE_IN_NAME,
        tally: 1,
      },
      [writeInCandidate.id]: {
        name: writeInCandidate.name,
        tally: 1,
      },
    },
  });
  await expectWriteInSummary({
    contestId: 'Governor-061a401b',
    invalidTally: 0,
    pendingTally: 1,
    totalTally: 2,
    candidateTallies: {
      [writeInCandidate.id]: {
        id: writeInCandidate.id,
        isWriteIn: true,
        name: writeInCandidate.name,
        tally: 1,
      },
    },
  });

  // circle back to invalid
  await apiClient.adjudicateWriteIn({
    type: 'invalid',
    writeInId,
  });
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  await expectContestResults({
    type: 'candidate',
    ballots: 184,
    overvotes: 4,
    undervotes: 3,
    officialOptionTallies: {
      'Hannah-Dustin-ab4ef7c8': 2,
      'John-Spencer-9ffb5970': 172,
      'Josiah-Bartlett-1bb99985': 2,
    },
    writeInOptionTallies: {
      [Tabulation.PENDING_WRITE_IN_ID]: {
        name: Tabulation.PENDING_WRITE_IN_NAME,
        tally: 1,
      },
    },
  });
  expect(
    (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
      contestId
    ]
  ).toEqual({
    candidateTallies: {},
    contestId: 'Governor-061a401b',
    invalidTally: 1,
    pendingTally: 1,
    totalTally: 2,
  });

  // write-in candidate should be deleted as they are no longer referenced
  expect(await apiClient.getWriteInCandidates({ contestId })).toEqual([]);

  // adjudication queue metadata should be updated
  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 1,
      totalTally: 2,
    },
  ]);
});
