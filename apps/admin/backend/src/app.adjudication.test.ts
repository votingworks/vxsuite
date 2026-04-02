import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { assert, assertDefined, find } from '@votingworks/basics';
import { loadImageMetadata } from '@votingworks/image-utils';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
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
  Rect,
  safeParseElectionDefinition,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { sha256 } from 'js-sha256';
import { readdirSync } from 'node:fs';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
} from '../test/app';
import {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  BallotAdjudicationData,
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

const MANUAL_CAST_VOTE_RECORD_EXPORT_ID =
  '864a2854-ee26-4223-8097-9633b7bed096';

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
  const baseElectionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  // add a second ballot style to the election so we can test ballot style group ordering
  const baseElection = baseElectionDefinition.election;
  const modifiedElectionData = JSON.stringify({
    ...JSON.parse(baseElectionDefinition.electionData),
    ballotStyles: [
      ...baseElection.ballotStyles,
      {
        id: 'card-number-4',
        groupId: 'card-number-4',
        precincts: baseElection.ballotStyles[0]!.precincts,
        districts: baseElection.ballotStyles[0]!.districts,
      },
    ],
  });
  const electionDefinition =
    safeParseElectionDefinition(modifiedElectionData).unsafeUnwrap();

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [
      AdjudicationReason.BlankBallot,
      AdjudicationReason.MarginalMark,
      AdjudicationReason.Overvote,
      AdjudicationReason.Undervote,
    ],
    markThresholds: {
      marginal: 0.05,
      definite: 0.1,
    },
  };
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

  // create a sheet 1 cvr with a write-in and marginal mark (write-in is already set in fixture)
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

  let queue = await apiClient.getBallotAdjudicationQueue();
  expect(queue).toHaveLength(1);
  const firstCvrId = queue[0];
  let nextForAdjudication = await apiClient.getNextCvrIdForBallotAdjudication();
  expect(nextForAdjudication).toEqual(queue[0]);

  // create a second cvr that is a bmd with an undervote.
  // bmds are sorted after hmpbs, so this should appear after the first cvr.
  const bmdReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const modifiedSnapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Modified
        );
        modifiedSnapshot.Type = CVR.CVRType.Original;
        // clear contest selections for the target contest to create an undervote,
        // but keep other contests so the ballot is not blank
        const bmdContest = modifiedSnapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (bmdContest) {
          bmdContest.CVRContestSelection = [];
        }
        return {
          ...cvr,
          UniqueId: `bmd-${cvr.UniqueId}`,
          BallotSheetId: undefined,
          CVRSnapshot: [modifiedSnapshot],
          CurrentSnapshotId: modifiedSnapshot['@id'],
        };
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: bmdReportPath,
    })
  ).unsafeUnwrap();

  queue = await apiClient.getBallotAdjudicationQueue();

  expect(queue).toHaveLength(2);
  expect(queue[0]).toEqual(firstCvrId);
  const bmdCvrId = queue[1];

  // create a third cvr that is sheet 2 with an overvote.
  // sheet 2 sorts after sheet 1 but before bmd, so it should appear in between.
  const sheet2ReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Modified
        );
        const contest = snapshot.CVRContest.find(
          (c) => c.ContestId === contestId
        );
        if (contest) {
          const contestDefinition = electionDefinition.election.contests.find(
            (c) => c.id === contestId
          );
          assert(contestDefinition && contestDefinition.type === 'candidate');

          contest.CVRContestSelection = [];
          const candidatesToSelect = contestDefinition.candidates.slice(
            0,
            contestDefinition.seats + 1
          );

          for (const candidate of candidatesToSelect) {
            contest.CVRContestSelection.push({
              '@type': 'CVR.CVRContestSelection',
              ContestSelectionId: candidate.id,
              SelectionPosition: [
                {
                  '@type': 'CVR.SelectionPosition',
                  CVRWriteIn: undefined,
                  HasIndication: CVR.IndicationStatus.Yes,
                  MarkMetricValue: ['0.9'],
                  NumberVotes: 1,
                  Position: 1,
                },
              ],
            });
          }
        }
        return {
          ...cvr,
          UniqueId: `sheet2-${cvr.UniqueId}`,
          BallotSheetId: '2',
        };
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: sheet2ReportPath,
    })
  ).unsafeUnwrap();

  queue = await apiClient.getBallotAdjudicationQueue();

  expect(queue).toHaveLength(3);
  expect(queue[0]).toEqual(firstCvrId);
  expect(queue[2]).toEqual(bmdCvrId);
  const sheet2CvrId = queue[1];

  // create a fourth cvr with a subsequent ballot style (card-number-4) and a write-in.
  // it should appear after sheet 2 (same ballot style sorts first) and before the bmd.
  const ballotStyle2ReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => ({
        ...cvr,
        UniqueId: `bs4-${cvr.UniqueId}`,
        BallotStyleId: 'card-number-4',
      }),
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: ballotStyle2ReportPath,
    })
  ).unsafeUnwrap();

  queue = await apiClient.getBallotAdjudicationQueue();

  expect(queue).toHaveLength(4);
  expect(queue[0]).toEqual(firstCvrId);
  expect(queue[1]).toEqual(sheet2CvrId);
  expect(queue[3]).toEqual(bmdCvrId);
  const ballotStyle2CvrId = queue[2];

  // create a blank ballot with the latter ballot style (card-number-4).
  // blank ballots sort after non-blank, so it should appear second to last.
  const blankBallotStyle2ReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Modified
        );
        for (const contest of snapshot.CVRContest) {
          contest.CVRContestSelection = [];
        }
        return {
          ...cvr,
          UniqueId: `blank-bs4-${cvr.UniqueId}`,
          BallotStyleId: 'card-number-4',
        };
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: blankBallotStyle2ReportPath,
    })
  ).unsafeUnwrap();

  queue = await apiClient.getBallotAdjudicationQueue();

  expect(queue).toHaveLength(5);
  expect(queue[0]).toEqual(firstCvrId);
  expect(queue[1]).toEqual(sheet2CvrId);
  expect(queue[2]).toEqual(ballotStyle2CvrId);
  expect(queue[3]).toEqual(bmdCvrId);
  const blankBallotStyle2CvrId = queue[4];

  // create a blank ballot with the earlier ballot style (card-number-3).
  // it should appear third to last (before the card-number-4 blank ballot).
  const blankBallotStyle1ReportPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        const snapshot = find(
          cvr.CVRSnapshot,
          (s) => s.Type === CVR.CVRType.Modified
        );
        for (const contest of snapshot.CVRContest) {
          contest.CVRContestSelection = [];
        }
        return {
          ...cvr,
          UniqueId: `blank-bs3-${cvr.UniqueId}`,
        };
      },
    }
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: blankBallotStyle1ReportPath,
    })
  ).unsafeUnwrap();

  queue = await apiClient.getBallotAdjudicationQueue();

  expect(queue).toHaveLength(6);
  expect(queue[0]).toEqual(firstCvrId);
  expect(queue[1]).toEqual(sheet2CvrId);
  expect(queue[2]).toEqual(ballotStyle2CvrId);
  expect(queue[3]).toEqual(bmdCvrId);
  expect(queue[5]).toEqual(blankBallotStyle2CvrId);
  nextForAdjudication = await apiClient.getNextCvrIdForBallotAdjudication();
  expect(nextForAdjudication).toEqual(queue[0]);
});

test('getBallotAdjudicationQueueMetadata', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  };
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const queueMetadata = await apiClient.getBallotAdjudicationQueueMetadata();
  expect(queueMetadata.totalTally).toEqual(queueMetadata.pendingTally);
});

test('getBallotImages on hmpb', async () => {
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
  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  expect(cvrIds).toHaveLength(1);
  const [cvrId] = cvrIds;
  assert(cvrId !== undefined);

  const ballotImages = await apiClient.getBallotImages({ cvrId });
  const { front } = ballotImages;
  assert(front.type === 'hmpb');

  const imageBytes = await readFile(
    join(
      reportDirectoryPath,
      MANUAL_CAST_VOTE_RECORD_EXPORT_ID,
      `${MANUAL_CAST_VOTE_RECORD_EXPORT_ID}-front.jpg`
    )
  );
  expect(front.imageUrl).toEqual(
    `data:image/jpeg;base64,${imageBytes.toString('base64')}`
  );

  const metadata = await loadImageMetadata(imageBytes);
  const expectedBallotCoordinates: Rect = {
    width: metadata.unsafeUnwrap().width,
    height: metadata.unsafeUnwrap().height,
    x: 0,
    y: 0,
  };
  expect(front.ballotCoordinates).toEqual(expectedBallotCoordinates);

  const contestLayout = find(
    front.layout.contests,
    (c) => c.contestId === contestId
  );
  expect(contestLayout.bounds).toEqual({
    width: 1161,
    height: 374,
    x: 436,
    y: 1183,
  });

  const writeInOptionLayout = assertDefined(
    contestLayout.options.find(
      (layout) =>
        layout.definition?.type === 'candidate' && layout.definition.isWriteIn
    )
  );
  expect(writeInOptionLayout.bounds).toMatchInlineSnapshot(`
    {
      "height": 141,
      "width": 269,
      "x": 1327,
      "y": 1183,
    }
  `);
});

test('getBallotImages on bmd', async () => {
  const { auth, apiClient, workspace } = buildTestEnvironment();
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

  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  expect(cvrIds).toHaveLength(40);
  const [cvrId1] = cvrIds;
  assert(cvrId1 !== undefined);

  const ballotImages = await apiClient.getBallotImages({ cvrId: cvrId1 });
  expect(ballotImages.front.type).toEqual('bmd');

  // verify that unconfigure cleans up ballot image files
  expect(readdirSync(workspace.store.getBallotImagesPath())).not.toHaveLength(
    0
  );
  mockSystemAdministratorAuth(auth);
  await apiClient.unconfigure();
  expect(readdirSync(workspace.store.getBallotImagesPath())).toHaveLength(0);
});

test('getBallotImages when image is corrupted', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const corruptedImageFileContents = '';
  const exportDirectoryPath = await modifyCastVoteRecordExport(
    manualCastVoteRecordExport.asDirectoryPath(),
    {
      castVoteRecordModifier: (cvr) => {
        if (cvr.UniqueId !== MANUAL_CAST_VOTE_RECORD_EXPORT_ID) {
          return cvr;
        }
        assert(cvr.BallotImage !== undefined);
        assert(cvr.BallotImage[0] !== undefined);
        assert(cvr.BallotImage[1] !== undefined);
        assert(cvr.BallotImage[0].Hash !== undefined);
        const hashComponents = cvr.BallotImage[0].Hash.Value.split('-');
        assert(hashComponents.length === 2);
        const layoutFileHash = assertDefined(hashComponents[1]);
        return {
          ...cvr,
          BallotImage: [
            {
              ...cvr.BallotImage[0],
              Hash: {
                ...cvr.BallotImage[0].Hash,
                Value: `${sha256(
                  corruptedImageFileContents
                )}-${layoutFileHash}`,
              },
            },
            cvr.BallotImage[1],
          ],
        };
      },
    }
  );
  await writeFile(
    join(
      exportDirectoryPath,
      MANUAL_CAST_VOTE_RECORD_EXPORT_ID,
      `${MANUAL_CAST_VOTE_RECORD_EXPORT_ID}-front.jpg`
    ),
    corruptedImageFileContents
  );
  (
    await apiClient.addCastVoteRecordFile({
      path: exportDirectoryPath,
    })
  ).unsafeUnwrap();

  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  expect(cvrIds).toHaveLength(1);
  const [cvrId] = cvrIds;
  assert(cvrId !== undefined);

  const ballotImages = await apiClient.getBallotImages({ cvrId });
  const { front } = ballotImages;
  assert(front.type === 'hmpb');
  expect(front.imageUrl).toBeUndefined();
  expect(front.ballotCoordinates).toEqual({
    height: 0,
    width: 0,
    x: 0,
    y: 0,
  });
});

test('getNextCvrIdForBallotAdjudication', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    adminAdjudicationReasons: [AdjudicationReason.MarginalMark],
  };
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const adjudicationQueue = await apiClient.getBallotAdjudicationQueue();

  async function adjudicateAtIndex(index: number) {
    const cvrId = adjudicationQueue[index] || '';
    const adjData = await apiClient.getBallotAdjudicationData({ cvrId });
    for (const contest of adjData.contests) {
      if (contest.tag) {
        await apiClient.adjudicateCvrContest({
          contestId: contest.contestId,
          cvrId,
          adjudicatedContestOptionById: {},
          side: 'front',
        });
      }
    }
    await apiClient.setCvrResolved({ cvrId });
  }

  expect(await apiClient.getNextCvrIdForBallotAdjudication()).toEqual(
    adjudicationQueue[0]
  );

  await adjudicateAtIndex(0);
  expect(await apiClient.getNextCvrIdForBallotAdjudication()).toEqual(
    adjudicationQueue[1]
  );

  await adjudicateAtIndex(2);
  expect(await apiClient.getNextCvrIdForBallotAdjudication()).toEqual(
    adjudicationQueue[1]
  );

  await adjudicateAtIndex(1);
  expect(await apiClient.getNextCvrIdForBallotAdjudication()).toEqual(
    adjudicationQueue[3]
  );

  for (const [i] of adjudicationQueue.entries()) {
    await adjudicateAtIndex(i);
  }
  expect(await apiClient.getNextCvrIdForBallotAdjudication()).toEqual(null);
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
        bmd: [],
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
    summary: Partial<Tabulation.ContestWriteInSummary>
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

  // find the CVR in the queue that has the unmarked write-in for the Governor contest
  const adjudicationQueue = await apiClient.getBallotAdjudicationQueue();
  let cvrId: string | undefined;
  let adjData: BallotAdjudicationData | undefined;
  for (const id of adjudicationQueue) {
    const data = await apiClient.getBallotAdjudicationData({ cvrId: id });
    const contest = data.contests.find(
      (c) => c.contestId === WRITE_IN_CONTEST_ID
    );
    if (contest?.tag?.hasUnmarkedWriteIn) {
      cvrId = id;
      adjData = data;
      break;
    }
  }
  assert(cvrId !== undefined);
  assert(adjData !== undefined);

  const contestData = find(
    adjData.contests,
    (c) => c.contestId === WRITE_IN_CONTEST_ID
  );
  assert(contestData.tag !== undefined);
  expect(contestData.tag.hasUnmarkedWriteIn).toEqual(true);
  expect(contestData.tag.isResolved).toEqual(false);

  // a UWI should be reflected in tallies if we mark it as valid
  const writeInOption = find(
    contestData.options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(writeInOption.writeInRecord !== undefined);
  expect(writeInOption.writeInRecord.isUnmarked).toEqual(true);

  await apiClient.adjudicateCvrContest({
    cvrId,
    contestId: WRITE_IN_CONTEST_ID,
    side: 'front',
    adjudicatedContestOptionById: {
      'write-in-0': {
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
      'write-in-0': {
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

  await apiClient.setCvrResolved({ cvrId });

  const adjDataAfter = await apiClient.getBallotAdjudicationData({ cvrId });
  const contestDataAfter = find(
    adjDataAfter.contests,
    (c) => c.contestId === WRITE_IN_CONTEST_ID
  );
  assert(contestDataAfter.tag !== undefined);
  expect(contestDataAfter.tag.isResolved).toEqual(true);
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
  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  expect(cvrIds).toHaveLength(62);

  // find a CVR that has a write-in record for the Governor contest
  let maybeCvrId: string | undefined;
  for (const id of cvrIds) {
    const data = await apiClient.getBallotAdjudicationData({ cvrId: id });
    const contest = data.contests.find((c) => c.contestId === contestId);
    const option = contest?.options.find(
      (o) => o.definition.id === 'write-in-0'
    );
    if (option?.writeInRecord) {
      maybeCvrId = id;
      break;
    }
  }
  const cvrId = assertDefined(maybeCvrId);

  const initialAdjData = await apiClient.getBallotAdjudicationData({ cvrId });
  const initialContestData = find(
    initialAdjData.contests,
    (c) => c.contestId === contestId
  );
  const writeInOption = find(
    initialContestData.options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(writeInOption.writeInRecord !== undefined);
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
        bmd: [],
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
    summary: Tabulation.ContestWriteInSummary
  ): Promise<void> {
    expect(
      (await apiClient.getElectionWriteInSummary()).contestWriteInSummaries[
        contestId
      ]
    ).toEqual(summary);
  }

  // unadjudicated results
  expect(writeInOption.writeInRecord.status).toEqual('pending');
  expect(await apiClient.getBallotAdjudicationQueueMetadata()).toEqual({
    pendingTally: 62,
    totalTally: 62,
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

  assert(initialContestData.tag !== undefined);
  expect(initialContestData.tag.hasWriteIn).toEqual(true);
  expect(initialContestData.tag.isResolved).toEqual(false);

  // check the write-in being marked as invalid (false)
  await apiClient.adjudicateCvrContest(
    formAdjudicatedCvrContest({
      'write-in-0': {
        type: 'write-in-option',
        hasVote: false,
      },
    })
  );

  const adjDataAfterInvalid = await apiClient.getBallotAdjudicationData({
    cvrId,
  });
  const contestDataAfterInvalid = find(
    adjDataAfterInvalid.contests,
    (c) => c.contestId === contestId
  );
  assert(contestDataAfterInvalid.tag !== undefined);
  expect(contestDataAfterInvalid.tag.hasWriteIn).toEqual(true);
  expect(contestDataAfterInvalid.tag.isResolved).toEqual(true);

  const invalidWriteInOption = find(
    contestDataAfterInvalid.options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(invalidWriteInOption.writeInRecord !== undefined);
  assert(invalidWriteInOption.writeInRecord.status === 'adjudicated');
  expect(invalidWriteInOption.writeInRecord.adjudicationType).toEqual(
    'invalid'
  );
  assert(invalidWriteInOption.voteAdjudication !== undefined);
  expect(invalidWriteInOption.voteAdjudication.isVote).toEqual(false);
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
  const adjDataAfterOfficial = await apiClient.getBallotAdjudicationData({
    cvrId,
  });
  const officialWriteInOption = find(
    find(adjDataAfterOfficial.contests, (c) => c.contestId === contestId)
      .options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(officialWriteInOption.writeInRecord !== undefined);
  assert(officialWriteInOption.writeInRecord.status === 'adjudicated');
  assert(
    officialWriteInOption.writeInRecord.adjudicationType ===
      'official-candidate'
  );
  expect(officialWriteInOption.writeInRecord.candidateId).toEqual(
    'Hannah-Dustin-ab4ef7c8'
  );
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
  const adjDataAfterWriteIn = await apiClient.getBallotAdjudicationData({
    cvrId,
  });
  const writeInCandidateOption = find(
    find(adjDataAfterWriteIn.contests, (c) => c.contestId === contestId)
      .options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(writeInCandidateOption.writeInRecord !== undefined);
  assert(writeInCandidateOption.writeInRecord.status === 'adjudicated');
  assert(
    writeInCandidateOption.writeInRecord.adjudicationType ===
      'write-in-candidate'
  );
  expect(writeInCandidateOption.writeInRecord.candidateId).toEqual(
    writeInCandidate.id
  );
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
  const adjDataAfterCircleBack = await apiClient.getBallotAdjudicationData({
    cvrId,
  });
  const circleBackOption = find(
    find(adjDataAfterCircleBack.contests, (c) => c.contestId === contestId)
      .options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(circleBackOption.writeInRecord !== undefined);
  assert(circleBackOption.writeInRecord.status === 'adjudicated');
  expect(circleBackOption.writeInRecord.adjudicationType).toEqual('invalid');
  assert(circleBackOption.voteAdjudication !== undefined);
  expect(circleBackOption.voteAdjudication.isVote).toEqual(false);
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
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

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

  const [cvrId] = await apiClient.getBallotAdjudicationQueue();
  assert(cvrId !== undefined);

  const adjData = await apiClient.getBallotAdjudicationData({ cvrId });
  const contestData = find(adjData.contests, (c) => c.contestId === contestId);
  assert(contestData.tag !== undefined);
  expect(contestData.tag.hasMarginalMark).toEqual(true);

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
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

  // modify the cvr for a contest to include mark scores
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';

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

  // CVR is still in the queue due to write-ins (always tagged)
  const [cvrId] = await apiClient.getBallotAdjudicationQueue();
  assert(cvrId !== undefined);

  const marginalMarks = await apiClient.getMarginalMarks({
    cvrId,
    contestId,
  });
  expect(marginalMarks).toHaveLength(0);

  const adjData = await apiClient.getBallotAdjudicationData({ cvrId });
  const contestData = find(adjData.contests, (c) => c.contestId === contestId);
  expect(contestData.tag?.hasMarginalMark).toEqual(false);
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
  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  // look at a contest that can have multiple write-ins per ballot
  const contestId = 'zoo-council-mammal';
  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  expect(cvrIds).toHaveLength(40);
  const [cvrId1] = cvrIds;
  assert(cvrId1 !== undefined);

  const marginalMarks = await apiClient.getMarginalMarks({
    cvrId: cvrId1,
    contestId,
  });
  expect(marginalMarks).toHaveLength(0);
});
