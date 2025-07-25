import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { assert, assertDefined, find } from '@votingworks/basics';
import { toDataUrl, loadImageData } from '@votingworks/image-utils';
import { join } from 'node:path';
import {
  BooleanEnvironmentVariableName,
  ContestResultsSummary,
  UNMARKED_WRITE_IN_SELECTION_POSITION_OTHER_STATUS,
  buildElectionResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  AdjudicationReason,
  ContestOptionId,
  CVR,
  DEFAULT_SYSTEM_SETTINGS,
  Id,
  Rect,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { ContestWriteInSummary } from '@votingworks/types/src/tabulation';
import { IndicationStatus } from '@votingworks/types/src/cdf/cast-vote-records';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  HmpbImageView,
  VoteAdjudication,
  WriteInRecord,
} from './types';

vi.setConfig({
  testTimeout: 30_000,
});

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
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('getAdjudicationQueue returns a properly ordered queue', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

  // create a cvr with a write-in and marginal mark (write-in is already set in fixture)
  const firstReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Original
        );

        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const option0 = assertDefined(
            contest.CVRContestSelection[0]?.SelectionPosition[0]
          );
          option0.MarkMetricValue = ['0.08'];
        }
        return cvr;
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: firstReportPath,
    })
  ).unsafeUnwrap();

  const firstQueue = await apiClient.getAdjudicationQueue({
    contestId,
  });
  expect(firstQueue).toHaveLength(1);
  const firstCvrId = firstQueue[0];
  const firstNextForAdjudication = await apiClient.getNextCvrIdForAdjudication({
    contestId,
  });

  // create a second cvr with write-in and no marginal mark (write-in is already set in fixture).
  // this should appear first
  const secondReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => ({
        ...cvr,
        UniqueId: `x-${cvr.UniqueId}`,
      }),
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: secondReportPath,
    })
  ).unsafeUnwrap();

  const secondQueue = await apiClient.getAdjudicationQueue({
    contestId,
  });

  expect(secondQueue).toHaveLength(2);
  expect(secondQueue[1]).toEqual(firstCvrId);
  const secondNextForAdjudication = await apiClient.getNextCvrIdForAdjudication(
    { contestId }
  );

  // the first pending cvr should now be different
  expect(firstNextForAdjudication).not.toEqual(secondNextForAdjudication);

  // add a third file with only a marginal mark and no write-in.
  // This should appear at the end of the queue
  const thirdReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Original
        );
        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const option0 = assertDefined(
            contest.CVRContestSelection[0]?.SelectionPosition[0]
          );
          option0.MarkMetricValue = ['0.08'];
          // mark all remaining options as unmarked, removing the pre-existing write-in
          for (const option of contest.CVRContestSelection.slice(1)) {
            assertDefined(option?.SelectionPosition[0]).MarkMetricValue = [
              '0.0',
            ];
            assertDefined(option?.SelectionPosition[0]).HasIndication =
              IndicationStatus.No;
          }
        }
        return {
          ...cvr,
          UniqueId: `x-2-${cvr.UniqueId}`,
        };
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: thirdReportPath,
    })
  ).unsafeUnwrap();

  const thirdQueue = await apiClient.getAdjudicationQueue({
    contestId,
  });

  expect(thirdQueue).toHaveLength(3);
  expect(thirdQueue.slice(0, 2)).toEqual(secondQueue);
  const thirdNextForAdjudication = await apiClient.getNextCvrIdForAdjudication({
    contestId,
  });

  // the first pending cvr ID should not have changed this time
  expect(thirdNextForAdjudication).toEqual(secondNextForAdjudication);
});

test('getAdjudicationQueueMetadata', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestsWithWriteIns = electionDefinition.election.contests.filter(
    (contest) => contest.type === 'candidate' && contest.allowWriteIns
  );

  const allQueueMetadata = await apiClient.getAdjudicationQueueMetadata();
  expect(allQueueMetadata).toHaveLength(contestsWithWriteIns.length);
  assert(
    allQueueMetadata.every(
      (metadata) => metadata.totalTally === metadata.pendingTally
    )
  );
});

test('getBallotImageView on hmpb', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
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
  const cvrIds = await apiClient.getAdjudicationQueue({
    contestId,
  });
  expect(cvrIds).toHaveLength(1);
  const [cvrId] = cvrIds;
  assert(cvrId !== undefined);

  const ballotImageView = await apiClient.getBallotImageView({
    cvrId,
    contestId,
  });

  // check first write-in image
  assert(ballotImageView);

  const {
    imageUrl: actualImageUrl,
    ballotCoordinates,
    contestCoordinates,
    optionLayouts,
  } = ballotImageView as HmpbImageView;

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
  expect(ballotCoordinates).toEqual(expectedBallotCoordinates);
  const expectedContestCoordinates: Rect = {
    height: 374,
    width: 1161,
    x: 436,
    y: 1183,
  };
  expect(contestCoordinates).toEqual(expectedContestCoordinates);
  const [writeIn] = await apiClient.getWriteIns({ cvrId, contestId });
  const writeInOptionLayout = assertDefined(
    optionLayouts.find((layout) => layout.definition?.id === writeIn?.optionId)
  );
  expect(writeInOptionLayout.bounds).toMatchInlineSnapshot(`
    {
      "height": 140,
      "width": 270,
      "x": 1327,
      "y": 1274,
    }
  `);
});

test('getBallotImageView on bmd', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath = castVoteRecordExport.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'zoo-council-mammal';
  const cvrIds = await apiClient.getAdjudicationQueue({
    contestId,
  });
  expect(cvrIds).toHaveLength(24);
  const [cvrId1] = cvrIds;
  assert(cvrId1 !== undefined);

  const ballotImageView = await apiClient.getBallotImageView({
    cvrId: cvrId1,
    contestId,
  });
  assert(ballotImageView);
});

test('getNextCvrIdForAdjudication', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

  const adjudicationQueue = await apiClient.getAdjudicationQueue({
    contestId,
  });

  async function adjudicateAtIndex(index: number) {
    await apiClient.adjudicateCvrContest({
      contestId,
      cvrId: adjudicationQueue[index] || '',
      adjudicatedContestOptionById: {},
      side: 'front',
    });
  }

  expect(await apiClient.getNextCvrIdForAdjudication({ contestId })).toEqual(
    adjudicationQueue[0]
  );

  await adjudicateAtIndex(0);
  expect(await apiClient.getNextCvrIdForAdjudication({ contestId })).toEqual(
    adjudicationQueue[1]
  );

  await adjudicateAtIndex(2);
  expect(await apiClient.getNextCvrIdForAdjudication({ contestId })).toEqual(
    adjudicationQueue[1]
  );

  await adjudicateAtIndex(1);
  expect(await apiClient.getNextCvrIdForAdjudication({ contestId })).toEqual(
    adjudicationQueue[3]
  );

  for (const [i] of adjudicationQueue.entries()) {
    await adjudicateAtIndex(i);
  }
  expect(await apiClient.getNextCvrIdForAdjudication({ contestId })).toEqual(
    null
  );
});

test('handling unmarked write-ins', async () => {
  const { apiClient, auth } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
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

  (
    await apiClient.addCastVoteRecordFile({
      path: exportDirectoryPath,
    })
  ).unsafeUnwrap();

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

  // check contest tag
  const [cvrId] = await apiClient.getAdjudicationQueue({
    contestId: WRITE_IN_CONTEST_ID,
  });
  assert(cvrId !== undefined);

  let cvrContestTag = await apiClient.getCvrContestTag({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
  });
  expect(cvrContestTag).toBeDefined();
  expect(cvrContestTag?.hasUnmarkedWriteIn).toEqual(true);
  expect(cvrContestTag?.isResolved).toEqual(false);

  // a UWI should be reflected in tallies if we mark it as valid
  const [writeIn] = await apiClient.getWriteIns({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
  });
  assert(writeIn !== undefined);
  expect(writeIn.isUnmarked).toEqual(true);

  await apiClient.adjudicateCvrContest({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
    side: 'front',
    adjudicatedContestOptionById: {
      [writeIn.optionId]: {
        type: 'write-in-option',
        hasVote: true,
        candidateId: OFFICIAL_CANDIDATE_ID,
        candidateType: 'official-candidate',
      },
    },
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
  await apiClient.adjudicateCvrContest({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
    side: 'front',
    adjudicatedContestOptionById: {
      [writeIn.optionId]: {
        type: 'write-in-option',
        hasVote: false,
      },
    },
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

  // Contest tag should be resolved
  cvrContestTag = await apiClient.getCvrContestTag({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
  });
  expect(cvrContestTag).toBeDefined();
  expect(cvrContestTag?.isResolved).toEqual(true);
});

test('adjudicating write-ins changes their status and is reflected in tallies', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
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
  const cvrIds = await apiClient.getAdjudicationQueue({
    contestId,
  });
  expect(cvrIds).toHaveLength(2);
  const cvrId = cvrIds[0]!;
  const [writeIn] = await apiClient.getWriteIns({ contestId, cvrId });
  assert(writeIn !== undefined);
  const { id: writeInId } = writeIn;
  const initialVotes = (await apiClient.getCastVoteRecordVoteInfo({ cvrId }))
    .votes;

  function formAdjudicatedCvrContest(
    overrides: Record<ContestOptionId, AdjudicatedContestOption>
  ): AdjudicatedCvrContest {
    return {
      adjudicatedContestOptionById: {
        'Josiah-Bartlett-1bb99985': {
          type: 'candidate-option',
          hasVote: !!initialVotes['Josiah-Bartlett-1bb99985'],
        },
        'Hannah-Dustin-ab4ef7c8': {
          type: 'candidate-option',
          hasVote: !!initialVotes['Hannah-Dustin-ab4ef7c8'],
        },
        'John-Spencer-9ffb5970': {
          type: 'candidate-option',
          hasVote: !!initialVotes['John-Spencer-9ffb5970'],
        },
        'write-in-0': {
          type: 'write-in-option',
          hasVote: false,
        },
        ...overrides,
      },
      cvrId,
      contestId,
      side: 'front',
    };
  }

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

  async function expectVoteAdjudication(
    optionId: string,
    expected?: Partial<VoteAdjudication>
  ) {
    if (!expected) {
      return expect(
        (await apiClient.getVoteAdjudications({ cvrId, contestId })).find(
          (adj) => adj.optionId === optionId
        )
      ).toBeUndefined();
    }
    expect(
      (await apiClient.getVoteAdjudications({ cvrId, contestId })).find(
        (adj) => adj.optionId === optionId
      )
    ).toMatchObject(expected);
  }

  async function expectWriteInRecord(
    id: Id,
    expected: Partial<WriteInRecord>
  ): Promise<void> {
    expect(
      (await apiClient.getWriteIns({ cvrId, contestId })).find(
        (w) => w.id === id
      )
    ).toMatchObject(expected);
  }

  // unadjudicated results
  await expectWriteInRecord(writeInId, {
    status: 'pending',
  });
  expect(
    (await apiClient.getAdjudicationQueueMetadata()).find(
      (data) => data.contestId === contestId
    )
  ).toEqual({
    contestId,
    pendingTally: 2,
    totalTally: 2,
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

  let cvrContestTag = await apiClient.getCvrContestTag({
    cvrId,
    contestId,
  });
  assert(cvrContestTag !== undefined);
  assert(cvrContestTag.hasWriteIn && !cvrContestTag.isResolved);

  // check the write-in being marked as invalid (false)
  await apiClient.adjudicateCvrContest(
    formAdjudicatedCvrContest({
      'write-in-0': {
        type: 'write-in-option',
        hasVote: false,
      },
    })
  );

  // check that adjudicating the contest marked the tag as resolved
  cvrContestTag = await apiClient.getCvrContestTag({
    cvrId,
    contestId,
  });
  assert(cvrContestTag !== undefined);
  assert(cvrContestTag.hasWriteIn && cvrContestTag.isResolved);

  await expectWriteInRecord(writeInId, {
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  await expectVoteAdjudication('write-in-0', { isVote: false });
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
  await apiClient.adjudicateCvrContest(
    formAdjudicatedCvrContest({
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'Hannah-Dustin-ab4ef7c8',
      },
    })
  );
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'official-candidate',
    candidateId: 'Hannah-Dustin-ab4ef7c8',
    status: 'adjudicated',
  });
  await expectVoteAdjudication('write-in-0', undefined);
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
  await apiClient.adjudicateCvrContest(
    formAdjudicatedCvrContest({
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'Mr. Hero',
      },
    })
  );
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
  await apiClient.adjudicateCvrContest(
    formAdjudicatedCvrContest({
      'write-in-0': {
        type: 'write-in-option',
        hasVote: false,
      },
    })
  );
  await expectWriteInRecord(writeInId, {
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  await expectVoteAdjudication('write-in-0', { isVote: false });
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
    (await apiClient.getAdjudicationQueueMetadata()).find(
      (data) => data.contestId === contestId
    )
  ).toEqual({
    contestId,
    pendingTally: 1,
    totalTally: 2,
  });
});

test('getMarginalMarks on an hmpb', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  // modify the cvr for a contest to include mark scores
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  let marginallyMarkedOptionId: string | undefined;

  const exportDirectoryPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Original
        );

        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const option0 = assertDefined(
            contest.CVRContestSelection[0]?.SelectionPosition[0]
          );
          option0.MarkMetricValue = ['0.01'];

          const option1 = assertDefined(
            contest.CVRContestSelection[1]?.SelectionPosition[0]
          );
          option1.MarkMetricValue = ['0.08'];
          marginallyMarkedOptionId =
            contest.CVRContestSelection[1]?.ContestSelectionId;

          const option2 = assertDefined(
            contest.CVRContestSelection[2]?.SelectionPosition[0]
          );
          option2.MarkMetricValue = ['0.10'];
        }
        return cvr;
      },
    }
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: exportDirectoryPath,
    })
  ).unsafeUnwrap();

  const [cvrId] = await apiClient.getAdjudicationQueue({
    contestId,
  });
  assert(cvrId !== undefined);

  const cvrContestTag = await apiClient.getCvrContestTag({
    cvrId,
    contestId,
  });
  expect(cvrContestTag?.hasMarginalMark).toEqual(true);

  const marginalMarks = await apiClient.getMarginalMarks({ cvrId, contestId });
  expect(marginalMarks).toHaveLength(1);
  expect(marginalMarks[0]).toEqual(marginallyMarkedOptionId);
});

test('getMarginalMarks returns nothing if AdjudicationReason.MarginalMark systemSetting is unset', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  // modify the cvr for a contest to include mark scores
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  let marginallyMarkedCvrId: string | undefined;

  const exportDirectoryPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        marginallyMarkedCvrId = cvr.UniqueId;
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Original
        );

        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const option0 = assertDefined(
            contest.CVRContestSelection[0]?.SelectionPosition[0]
          );
          option0.MarkMetricValue = ['0.01'];

          const option1 = assertDefined(
            contest.CVRContestSelection[1]?.SelectionPosition[0]
          );
          option1.MarkMetricValue = ['0.08'];

          const option2 = assertDefined(
            contest.CVRContestSelection[2]?.SelectionPosition[0]
          );
          option2.MarkMetricValue = ['0.10'];
        }
        return cvr;
      },
    }
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: exportDirectoryPath,
    })
  ).unsafeUnwrap();

  assert(marginallyMarkedCvrId !== undefined);
  const marginalMarks = await apiClient.getMarginalMarks({
    cvrId: marginallyMarkedCvrId,
    contestId,
  });
  expect(marginalMarks).toHaveLength(0);

  const cvrContestTag = await apiClient.getCvrContestTag({
    cvrId: marginallyMarkedCvrId,
    contestId,
  });
  expect(cvrContestTag).toBeUndefined();
});

test('getMarginalMarks returns an empty list for a bmd without mark scores', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  await configureMachine(apiClient, auth, electionDefinition, systemSettings);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'zoo-council-mammal';
  const cvrIds = await apiClient.getAdjudicationQueue({
    contestId,
  });
  expect(cvrIds).toHaveLength(24);
  const [cvrId1] = cvrIds;
  assert(cvrId1 !== undefined);

  const marginalMarks = await apiClient.getMarginalMarks({
    cvrId: cvrId1,
    contestId,
  });
  expect(marginalMarks).toHaveLength(0);
});
