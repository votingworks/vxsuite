import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionCombinedBallotPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import { assert, assertDefined, err, find, ok } from '@votingworks/basics';
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
import { LogEventId } from '@votingworks/logging';
import { sha256 } from 'js-sha256';
import { readdirSync } from 'node:fs';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
  mockSystemAdministratorAuth,
} from '../test/app';
import { seedOpenPrimaryCvrsAndAdjudications } from '../test/open_primary_fixture';
import {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  BallotAdjudicationData,
  ContestAdjudicationData,
} from './types';
import { getCurrentTime } from './get_current_time';

vi.mock('./get_current_time');

vi.setConfig({
  testTimeout: 30_000,
});

// Test helper: wraps the unified claimAndLoadBallot endpoint and returns
// just the claimed cvrId (or undefined)
async function claimBallot(
  peerApiClient: {
    claimAndLoadBallot: (input: {
      machineId: string;
      afterCvrId?: string;
    }) => Promise<{ cvrId: string } | undefined>;
  },
  input: { machineId: string; afterCvrId?: string }
): Promise<string | undefined> {
  const result = await peerApiClient.claimAndLoadBallot(input);
  return result?.cvrId;
}

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

const MANUAL_CAST_VOTE_RECORD_EXPORT_ID =
  '864a2854-ee26-4223-8097-9633b7bed096';

function buildNoVoteAdjudicatedContestOptionById(
  contest: ContestAdjudicationData
): Record<ContestOptionId, AdjudicatedContestOption> {
  const result: Record<ContestOptionId, AdjudicatedContestOption> = {};
  for (const option of contest.options) {
    const isWriteIn =
      option.definition.type === 'candidate' && option.definition.isWriteIn;
    result[option.definition.id] = isWriteIn
      ? { type: 'write-in-option', hasVote: false }
      : { type: 'official-option', hasVote: false };
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
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
        languages: baseElection.ballotStyles[0]!.languages,
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
          (s) => s.Type === CVR.CVRType.Interpreted
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
          (s) => s.Type === CVR.CVRType.Interpreted
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
          (s) => s.Type === CVR.CVRType.Interpreted
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
          (s) => s.Type === CVR.CVRType.Interpreted
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
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const adjudicationQueue = await apiClient.getBallotAdjudicationQueue();

  async function adjudicateAtIndex(index: number) {
    const cvrId = adjudicationQueue[index] || '';
    const { data: adjData } = assertDefined(
      (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
    );
    const contests = adjData.contests
      .filter((contest) => contest.tag)
      .map((contest) => ({
        contestId: contest.contestId,
        cvrId,
        adjudicatedContestOptionById:
          buildNoVoteAdjudicatedContestOptionById(contest),
      }));
    expect(await apiClient.adjudicateCvr({ cvrId, contests })).toEqual(ok());
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

test('getNextCvrIdForBallotAdjudication advances past the current ballot', async () => {
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
  expect(adjudicationQueue.length).toBeGreaterThan(2);

  // Without `currentCvrId`, returns the first eligible ballot.
  const first = await apiClient.getNextCvrIdForBallotAdjudication();
  expect(first).toEqual(adjudicationQueue[0]);

  // With `currentCvrId` = first, returns the second eligible ballot.
  const second = await apiClient.getNextCvrIdForBallotAdjudication({
    afterCvrId: adjudicationQueue[0],
  });
  expect(second).toEqual(adjudicationQueue[1]);

  // With `currentCvrId` = last queue entry, the search wraps around to the
  // first eligible ballot (nothing here is adjudicated yet).
  const lastInQueue = adjudicationQueue[adjudicationQueue.length - 1];
  expect(
    await apiClient.getNextCvrIdForBallotAdjudication({
      afterCvrId: lastInQueue,
    })
  ).toEqual(adjudicationQueue[0]);

  // The accept-and-next flow anchors on the ballot that was just
  // adjudicated — the cursor must still resolve when `afterCvrId` points at
  // an adjudicated ballot, continuing from its queue position rather than
  // restarting from the front (queue[0] is still pending here).
  expect(
    await apiClient.adjudicateCvr({
      cvrId: assertDefined(adjudicationQueue[1]),
      contests: [],
    })
  ).toEqual(ok());
  expect(
    await apiClient.getNextCvrIdForBallotAdjudication({
      afterCvrId: adjudicationQueue[1],
    })
  ).toEqual(adjudicationQueue[2]);

  // Advancing past an earlier ballot skips the adjudicated one.
  expect(
    await apiClient.getNextCvrIdForBallotAdjudication({
      afterCvrId: adjudicationQueue[0],
    })
  ).toEqual(adjudicationQueue[2]);
});

test('host claimAndLoadBallot returns data and bypasses claim when multi-station is off', async () => {
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
  const queue = await apiClient.getBallotAdjudicationQueue();
  const cvrId = assertDefined(queue[0]);

  // Multi-station is off — claimAndLoadBallot bypasses the claim system
  // and just returns the data.
  const result = (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap();
  expect(result?.cvrId).toEqual(cvrId);
  expect(result?.data.cvrId).toEqual(cvrId);

  // Now turn on multi-station and re-claim — goes through the real claim
  // flow and still succeeds because no other machine holds it.
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });
  const mResult = (
    await apiClient.claimAndLoadBallot({ cvrId })
  ).unsafeUnwrap();
  expect(mResult?.cvrId).toEqual(cvrId);
});

test('adjudicateCvr requires active claim', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const queue = await apiClient.getBallotAdjudicationQueue();
  const cvrId = assertDefined(queue[0]);

  // adjudicateCvr without claim returns claim-failed error
  expect(await apiClient.adjudicateCvr({ cvrId, contests: [] })).toEqual(
    err({ type: 'claim-failed' })
  );
});

test('host adjudicates its claimed ballot and can re-adjudicate it when multi-station is enabled', async () => {
  const { auth, apiClient, logger } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.AdminClientAdjudicationToggled,
    expect.objectContaining({ enabled: true })
  );

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const queue = await apiClient.getBallotAdjudicationQueue();
  const cvrId = assertDefined(queue[0]);

  // The host claims the ballot, then adjudication succeeds
  (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap();
  expect(await apiClient.adjudicateCvr({ cvrId, contests: [] })).toEqual(ok());

  // The claim is now completed, not active — but re-adjudicating an
  // already-adjudicated ballot is allowed without a fresh claim, which is
  // how the host edits a previously adjudicated ballot
  expect(await apiClient.adjudicateCvr({ cvrId, contests: [] })).toEqual(ok());
});

test('claim and release are no-ops when multi-station is disabled', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const queue = await apiClient.getBallotAdjudicationQueue();
  const cvrId = assertDefined(queue[0]);

  // claim succeeds and returns the ballot, bypassing the claim system when
  // multi-station is disabled
  expect(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()?.cvrId
  ).toEqual(cvrId);

  // release is a no-op
  await apiClient.releaseBallotAdjudicationClaim({ cvrId });

  // adjudication succeeds without a real claim
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        {
          contestId: 'contest-1',
          adjudicatedContestOptionById: {},
        },
      ],
    })
  ).toEqual(ok());
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
          (s) => s.Type === CVR.CVRType.Interpreted
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
    const { data } = assertDefined(
      (await apiClient.claimAndLoadBallot({ cvrId: id })).unsafeUnwrap()
    );
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
  expect(
    adjData.adjudicatedContests.some((c) => c.contestId === WRITE_IN_CONTEST_ID)
  ).toEqual(false);

  // a UWI should be reflected in tallies if we mark it as valid
  const writeInOption = find(
    contestData.options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(writeInOption.writeInRecord !== undefined);
  expect(writeInOption.writeInRecord.isUnmarked).toEqual(true);

  (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap();
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        {
          contestId: WRITE_IN_CONTEST_ID,
          adjudicatedContestOptionById: {
            'write-in-0': {
              type: 'write-in-option',
              hasVote: true,
              candidateId: OFFICIAL_CANDIDATE_ID,
              candidateType: 'official-candidate',
            },
          },
        },
      ],
    })
  ).toEqual(ok());

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
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        {
          contestId: WRITE_IN_CONTEST_ID,
          adjudicatedContestOptionById: {
            'write-in-0': {
              type: 'write-in-option',
              hasVote: false,
            },
          },
        },
      ],
    })
  ).toEqual(ok());

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

  const adjDataAfter = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
  const contestDataAfter = find(
    adjDataAfter.contests,
    (c) => c.contestId === WRITE_IN_CONTEST_ID
  );
  assert(contestDataAfter.tag !== undefined);
  expect(
    adjDataAfter.adjudicatedContests.some(
      (c) => c.contestId === WRITE_IN_CONTEST_ID
    )
  ).toEqual(true);
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
    const { data } = assertDefined(
      (await apiClient.claimAndLoadBallot({ cvrId: id })).unsafeUnwrap()
    );
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

  const initialAdjData = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
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
          type: 'official-option',
          hasVote: !!initialVotes['Josiah-Bartlett-1bb99985'],
        },
        'Hannah-Dustin-ab4ef7c8': {
          type: 'official-option',
          hasVote: !!initialVotes['Hannah-Dustin-ab4ef7c8'],
        },
        'John-Spencer-9ffb5970': {
          type: 'official-option',
          hasVote: !!initialVotes['John-Spencer-9ffb5970'],
        },
        'write-in-0': {
          type: 'write-in-option',
          hasVote: false,
        },
        ...overrides,
      },
      contestId,
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
  expect(
    initialAdjData.adjudicatedContests.some((c) => c.contestId === contestId)
  ).toEqual(false);

  // check the write-in being marked as invalid (false)
  (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap();
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        formAdjudicatedCvrContest({
          'write-in-0': {
            type: 'write-in-option',
            hasVote: false,
          },
        }),
      ],
    })
  ).toEqual(ok());

  const adjDataAfterInvalid = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
  const contestDataAfterInvalid = find(
    adjDataAfterInvalid.contests,
    (c) => c.contestId === contestId
  );
  assert(contestDataAfterInvalid.tag !== undefined);
  expect(contestDataAfterInvalid.tag.hasWriteIn).toEqual(true);
  expect(
    adjDataAfterInvalid.adjudicatedContests.some(
      (c) => c.contestId === contestId
    )
  ).toEqual(true);

  const invalidWriteInOption = find(
    contestDataAfterInvalid.options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(invalidWriteInOption.writeInRecord !== undefined);
  assert(invalidWriteInOption.writeInRecord.status === 'adjudicated');
  expect(invalidWriteInOption.writeInRecord.adjudicationType).toEqual(
    'invalid'
  );
  const adjudicatedAfterInvalid = find(
    adjDataAfterInvalid.adjudicatedContests,
    (c) => c.contestId === contestId
  );
  expect(
    adjudicatedAfterInvalid.adjudicatedContestOptionById['write-in-0']?.hasVote
  ).toEqual(false);
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
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        formAdjudicatedCvrContest({
          'write-in-0': {
            type: 'write-in-option',
            hasVote: true,
            candidateType: 'official-candidate',
            candidateId: 'Hannah-Dustin-ab4ef7c8',
          },
        }),
      ],
    })
  ).toEqual(ok());
  const adjDataAfterOfficial = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
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
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        formAdjudicatedCvrContest({
          'write-in-0': {
            type: 'write-in-option',
            hasVote: true,
            candidateType: 'write-in-candidate',
            candidateName: 'Mr. Hero',
          },
        }),
      ],
    })
  ).toEqual(ok());
  const adjDataAfterWriteIn = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
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
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        formAdjudicatedCvrContest({
          'write-in-0': {
            type: 'write-in-option',
            hasVote: false,
          },
        }),
      ],
    })
  ).toEqual(ok());
  const adjDataAfterCircleBack = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
  const circleBackOption = find(
    find(adjDataAfterCircleBack.contests, (c) => c.contestId === contestId)
      .options,
    (o) => o.definition.id === 'write-in-0'
  );
  assert(circleBackOption.writeInRecord !== undefined);
  assert(circleBackOption.writeInRecord.status === 'adjudicated');
  expect(circleBackOption.writeInRecord.adjudicationType).toEqual('invalid');
  const adjudicatedAfterCircleBack = find(
    adjDataAfterCircleBack.adjudicatedContests,
    (c) => c.contestId === contestId
  );
  expect(
    adjudicatedAfterCircleBack.adjudicatedContestOptionById['write-in-0']
      ?.hasVote
  ).toEqual(false);
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
  expect(
    await apiClient.getWriteInCandidates({ contestIds: [contestId] })
  ).toEqual([]);
});

test('peer API: claim, adjudicate, and resolve a ballot with real CVR fixtures', async () => {
  const { auth, apiClient, peerApiClient } = buildTestEnvironment();
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  await apiClient.setIsClientAdjudicationEnabled({ enabled: true });

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const queue = await apiClient.getBallotAdjudicationQueue();
  expect(queue.length).toBeGreaterThan(1);

  // Verify host sees all ballots as pending before adjudication
  const metadataBefore = await apiClient.getBallotAdjudicationQueueMetadata();
  expect(metadataBefore.pendingTally).toEqual(metadataBefore.totalTally);

  // Two clients claim different ballots. Claiming returns the claimed ballot's
  // adjudication data, mirroring the real client flow.
  const client1Claim = assertDefined(
    await peerApiClient.claimAndLoadBallot({ machineId: 'client-001' })
  );
  const cvrId1 = client1Claim.cvrId;
  const ballotData = client1Claim.data;
  expect(cvrId1).toEqual(queue[0]);
  expect(ballotData.cvrId).toEqual(cvrId1);
  expect(ballotData.contests.length).toBeGreaterThan(0);

  const cvrId2 = await claimBallot(peerApiClient, {
    machineId: 'client-002',
  });
  assert(cvrId2 !== undefined);
  expect(cvrId2).toEqual(queue[1]);
  expect(cvrId2).not.toEqual(cvrId1);

  // Client 1 fetches ballot image metadata via peer API
  const images = await peerApiClient.getBallotImageMetadata({ cvrId: cvrId1 });
  expect(images.cvrId).toEqual(cvrId1);

  // Client 1 fetches write-in candidates via peer API
  const writeInCandidates = await peerApiClient.getWriteInCandidates({
    contestIds: ballotData.contests.map((c) => c.contestId),
  });
  expect(writeInCandidates).toEqual([]);

  // Client 1 adjudicates all contests on their claimed ballot in a single call
  const client1Contests = ballotData.contests.map((contest) => {
    const adjudicatedContestOptionById: Record<
      string,
      AdjudicatedContestOption
    > = {};
    for (const option of contest.options) {
      const isWriteIn =
        option.definition.type === 'candidate' && option.definition.isWriteIn;
      adjudicatedContestOptionById[option.definition.id] = isWriteIn
        ? { type: 'write-in-option', hasVote: false }
        : { type: 'official-option', hasVote: option.scannedVote };
    }
    return {
      cvrId: cvrId1,
      contestId: contest.contestId,
      adjudicatedContestOptionById,
    };
  });

  expect(
    await peerApiClient.adjudicateCvr({
      machineId: 'client-001',
      cvrId: cvrId1,
      contests: client1Contests,
    })
  ).toEqual(ok());

  // Host can see the adjudication results: ballot data shows all contests resolved
  const hostBallotData = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId: cvrId1 })).unsafeUnwrap()
  ).data;
  const adjudicatedContestIds = new Set(
    hostBallotData.adjudicatedContests.map((c) => c.contestId)
  );
  for (const contest of hostBallotData.contests) {
    if (contest.tag) {
      expect(adjudicatedContestIds.has(contest.contestId)).toEqual(true);
    }
  }

  // Host queue metadata reflects one fewer pending ballot
  const metadataAfter = await apiClient.getBallotAdjudicationQueueMetadata();
  expect(metadataAfter.pendingTally).toEqual(metadataBefore.pendingTally - 1);

  // Host's next-CVR-to-adjudicate skips the completed ballot
  const nextCvrId = await apiClient.getNextCvrIdForBallotAdjudication();
  expect(nextCvrId).not.toEqual(cvrId1);

  // Release host's claim so clients can claim it
  assert(nextCvrId !== null);
  await apiClient.releaseBallotAdjudicationClaim({ cvrId: nextCvrId });

  // Completed ballot is permanently removed from the claimable pool.
  // Client 3 claims next and gets queue[2] (queue[1] is still held by client 2).
  const cvrId3 = await claimBallot(peerApiClient, {
    machineId: 'client-003',
  });
  assert(cvrId3 !== undefined);
  expect(cvrId3).toEqual(queue[2]);

  // Release client 2's claim — the ballot returns to the pool.
  await peerApiClient.releaseBallot({ machineId: 'client-002', cvrId: cvrId2 });

  // Released ballot (cvrId2) is available again — another client can claim
  const cvrId4 = await claimBallot(peerApiClient, {
    machineId: 'client-004',
  });
  assert(cvrId4 !== undefined);
  // Should get an uncompleted, unclaimed ballot (could be cvrId2 or another)
  expect(cvrId4).not.toEqual(cvrId1); // cvrId1 was completed
});

test('qualified write-in candidate management', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    areWriteInCandidatesQualified: true,
  };

  await configureMachine(
    apiClient,
    auth,
    electionDefinition,
    undefined,
    systemSettings
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  (
    await apiClient.addCastVoteRecordFile({
      path: manualCastVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestId = 'Governor-061a401b';

  // Initially no qualified write-in candidates
  expect(await apiClient.getQualifiedWriteInCandidates()).toEqual([]);

  // Add qualified candidates via batch update
  const updateResult = await apiClient.updateQualifiedWriteInCandidates({
    newCandidates: [
      { contestId, name: 'Alice' },
      { contestId, name: 'Bob' },
    ],
    deletedCandidateIds: [],
  });
  expect(updateResult.affectedBallotCount).toEqual(0);

  // Verify candidates were added
  const candidates = await apiClient.getQualifiedWriteInCandidates();
  expect(candidates).toHaveLength(2);
  expect(candidates.map((c) => c.name).sort()).toEqual(['Alice', 'Bob']);
  expect(candidates.every((c) => c.contestId === contestId)).toEqual(true);
  expect(candidates.every((c) => !c.hasAdjudicatedVotes)).toEqual(true);

  // Qualified candidates should appear in write-in summary with 0 tally
  const summary = await apiClient.getElectionWriteInSummary();
  const contestSummary = summary.contestWriteInSummaries[contestId];
  assert(contestSummary !== undefined);
  for (const candidate of candidates) {
    expect(contestSummary.candidateTallies[candidate.id]).toEqual({
      id: candidate.id,
      name: candidate.name,
      tally: 0,
      isWriteIn: true,
    });
  }

  // Delete Alice via batch update
  const aliceCandidate = assertDefined(
    candidates.find((c) => c.name === 'Alice')
  );
  const deleteResult = await apiClient.updateQualifiedWriteInCandidates({
    newCandidates: [],
    deletedCandidateIds: [aliceCandidate.id],
  });
  expect(deleteResult.affectedBallotCount).toEqual(0);

  // Verify only Bob remains
  const remainingCandidates = await apiClient.getQualifiedWriteInCandidates();
  expect(remainingCandidates).toHaveLength(1);
  const bobCandidate = assertDefined(remainingCandidates[0]);
  expect(bobCandidate.name).toEqual('Bob');

  // Clearing CVRs should not wipe qualified candidates
  await apiClient.clearCastVoteRecordFiles();
  const writeInCandidates = await apiClient.getQualifiedWriteInCandidates();
  expect(writeInCandidates.map((c) => c.name)).toEqual(['Bob']);

  // Delete via batch endpoint
  const directDeleteResult = await apiClient.updateQualifiedWriteInCandidates({
    newCandidates: [],
    deletedCandidateIds: [bobCandidate.id],
  });
  expect(directDeleteResult.affectedBallotCount).toEqual(0);

  // All candidates removed
  expect(await apiClient.getQualifiedWriteInCandidates()).toEqual([]);
});

test('qualified write-in mode: full flow with adjudication, tally reports, and candidate deletion', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    areWriteInCandidatesQualified: true,
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

  const contestId = 'Governor-061a401b';

  // Find a CVR with a write-in for the Governor contest
  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  let maybeCvrId: string | undefined;
  for (const id of cvrIds) {
    const { data } = assertDefined(
      (await apiClient.claimAndLoadBallot({ cvrId: id })).unsafeUnwrap()
    );
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

  // Add qualified write-in candidates
  const alice = await apiClient.addWriteInCandidate({
    contestId,
    name: 'Alice',
  });
  const bob = await apiClient.addWriteInCandidate({
    contestId,
    name: 'Bob',
  });

  // Before adjudication: qualified candidates appear with 0 tally in write-in summary
  const summaryBefore = await apiClient.getElectionWriteInSummary();
  const contestSummaryBefore = summaryBefore.contestWriteInSummaries[contestId];
  assert(contestSummaryBefore !== undefined);
  expect(contestSummaryBefore.candidateTallies[alice.id]).toEqual({
    id: alice.id,
    name: 'Alice',
    tally: 0,
    isWriteIn: true,
  });
  expect(contestSummaryBefore.candidateTallies[bob.id]).toEqual({
    id: bob.id,
    name: 'Bob',
    tally: 0,
    isWriteIn: true,
  });
  expect(contestSummaryBefore.pendingTally).toBeGreaterThan(0);

  // Qualified candidates appear with 0 tally in tally report
  const tallyBefore = (await apiClient.getResultsForTallyReports())[0]
    ?.scannedResults.contestResults[contestId];
  assert(tallyBefore !== undefined && tallyBefore.contestType === 'candidate');
  expect(tallyBefore.tallies[alice.id]).toEqual({
    id: alice.id,
    name: 'Alice',
    tally: 0,
    isWriteIn: true,
  });
  expect(tallyBefore.tallies[bob.id]).toEqual({
    id: bob.id,
    name: 'Bob',
    tally: 0,
    isWriteIn: true,
  });

  // Adjudicate a write-in for Alice
  const initialVotes = (await apiClient.getCastVoteRecordVoteInfo({ cvrId }))
    .votes;
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        {
          adjudicatedContestOptionById: {
            'Josiah-Bartlett-1bb99985': {
              type: 'official-option',
              hasVote: !!initialVotes['Josiah-Bartlett-1bb99985'],
            },
            'Hannah-Dustin-ab4ef7c8': {
              type: 'official-option',
              hasVote: !!initialVotes['Hannah-Dustin-ab4ef7c8'],
            },
            'John-Spencer-9ffb5970': {
              type: 'official-option',
              hasVote: !!initialVotes['John-Spencer-9ffb5970'],
            },
            'write-in-0': {
              type: 'write-in-option',
              hasVote: true,
              candidateType: 'write-in-candidate',
              candidateName: 'Alice',
            },
          },
          contestId,
        },
      ],
    })
  ).toEqual(ok());

  // After adjudication: Alice has votes, Bob still at 0
  const tallyAfter = (await apiClient.getResultsForTallyReports())[0]
    ?.scannedResults.contestResults[contestId];
  assert(tallyAfter !== undefined && tallyAfter.contestType === 'candidate');
  expect(tallyAfter.tallies[alice.id]).toEqual({
    id: alice.id,
    name: 'Alice',
    tally: 1,
    isWriteIn: true,
  });
  expect(tallyAfter.tallies[bob.id]).toEqual({
    id: bob.id,
    name: 'Bob',
    tally: 0,
    isWriteIn: true,
  });

  // Remaining pending write-in still shows (1 of 2 adjudicated)
  expect(tallyAfter.tallies[Tabulation.PENDING_WRITE_IN_ID]).toEqual({
    ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
    tally: 1,
  });

  // Write-in summary also shows Alice with votes and Bob with 0
  const summaryAfter = await apiClient.getElectionWriteInSummary();
  const contestSummaryAfter = summaryAfter.contestWriteInSummaries[contestId];
  assert(contestSummaryAfter !== undefined);
  expect(contestSummaryAfter.candidateTallies[alice.id]?.tally).toEqual(1);
  expect(contestSummaryAfter.candidateTallies[bob.id]).toEqual({
    id: bob.id,
    name: 'Bob',
    tally: 0,
    isWriteIn: true,
  });

  // Alice now has adjudicated votes
  const candidatesAfter = await apiClient.getQualifiedWriteInCandidates();
  const aliceAfter = candidatesAfter.find((c) => c.id === alice.id);
  assert(aliceAfter !== undefined);
  expect(aliceAfter.hasAdjudicatedVotes).toEqual(true);

  // Delete Alice — should trigger re-adjudication
  const deleteResult = await apiClient.updateQualifiedWriteInCandidates({
    newCandidates: [],
    deletedCandidateIds: [alice.id],
  });
  expect(deleteResult.affectedBallotCount).toEqual(1);

  // Alice's ballot should be back in the queue as not adjudicated
  const summaryAfterDelete = await apiClient.getElectionWriteInSummary();
  const contestSummaryAfterDelete =
    summaryAfterDelete.contestWriteInSummaries[contestId];
  assert(contestSummaryAfterDelete !== undefined);
  // Alice is gone from candidates
  expect(contestSummaryAfterDelete.candidateTallies[alice.id]).toBeUndefined();
  // Bob still present
  expect(contestSummaryAfterDelete.candidateTallies[bob.id]).toEqual({
    id: bob.id,
    name: 'Bob',
    tally: 0,
    isWriteIn: true,
  });
});

test('deleting a qualified write-in candidate preserves adjudicated votes on unrelated contests', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { castVoteRecordExport } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const systemSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    areWriteInCandidatesQualified: true,
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

  const governorContestId = 'Governor-061a401b';

  // Find a CVR with a write-in on the Governor contest.
  const cvrIds = await apiClient.getBallotAdjudicationQueue();
  let maybeCvrId: string | undefined;
  for (const id of cvrIds) {
    const { data } = assertDefined(
      (await apiClient.claimAndLoadBallot({ cvrId: id })).unsafeUnwrap()
    );
    if (
      data.contests
        .find((c) => c.contestId === governorContestId)
        ?.options.find((o) => o.definition.id === 'write-in-0')?.writeInRecord
    ) {
      maybeCvrId = id;
      break;
    }
  }
  const cvrId = assertDefined(maybeCvrId);

  // Adjudicate the Governor write-in for Alice.
  const alice = await apiClient.addWriteInCandidate({
    contestId: governorContestId,
    name: 'Alice',
  });
  // Also adjudicate a different contest on the same CVR, flipping an option
  // so the change is observable. This puts a second entry into the CVR's
  // adjudicated_votes JSON alongside the Governor entry.
  const adjData = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
  const otherContest = assertDefined(
    adjData.contests.find((c) => c.contestId !== governorContestId)
  );
  const optionToFlip = assertDefined(
    otherContest.options.find(
      (o) => o.definition.type === 'candidate' && !o.scannedVote
    )
  );
  expect(
    await apiClient.adjudicateCvr({
      cvrId,
      contests: [
        {
          adjudicatedContestOptionById: {
            'write-in-0': {
              type: 'write-in-option',
              hasVote: true,
              candidateType: 'write-in-candidate',
              candidateName: 'Alice',
            },
          },
          contestId: governorContestId,
        },
        {
          adjudicatedContestOptionById: {
            [optionToFlip.definition.id]: {
              type: 'official-option',
              hasVote: true,
            },
          },
          contestId: otherContest.contestId,
        },
      ],
    })
  ).toEqual(ok());

  // Delete Alice. This resets her contest's entry in adjudicated_votes, but
  // the unrelated contest's entry should survive.
  expect(
    (
      await apiClient.updateQualifiedWriteInCandidates({
        newCandidates: [],
        deletedCandidateIds: [alice.id],
      })
    ).affectedBallotCount
  ).toEqual(1);

  // The unrelated contest's flipped vote should still be adjudicated.
  const dataAfterDelete = assertDefined(
    (await apiClient.claimAndLoadBallot({ cvrId })).unsafeUnwrap()
  ).data;
  const adjudicatedOtherContest = assertDefined(
    dataAfterDelete.adjudicatedContests.find(
      (c) => c.contestId === otherContest.contestId
    )
  );
  expect(
    adjudicatedOtherContest.adjudicatedContestOptionById[
      optionToFlip.definition.id
    ]?.hasVote
  ).toEqual(true);
});

test('open primary crossover votes', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const { election } = electionDefinition;

  const { apiClient, auth, workspace } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, election);

  const { cvrIds, resolvedCrossoverCvrId } =
    await seedOpenPrimaryCvrsAndAdjudications({
      apiClient,
      electionId: workspace.store.getCurrentElectionId()!,
      store: workspace.store,
    });
  const unresolvedCrossoverCvrId = assertDefined(cvrIds[8]);

  const queue = await apiClient.getBallotAdjudicationQueue();
  expect(queue).toContain(resolvedCrossoverCvrId);
  expect(queue).toContain(unresolvedCrossoverCvrId);
  expect(
    assertDefined(
      (
        await apiClient.claimAndLoadBallot({
          cvrId: unresolvedCrossoverCvrId,
        })
      ).unsafeUnwrap()
    ).data.tag
  ).toEqual({ isBlankBallot: false, hasCrossoverVote: true });
  // Even after resolution, original adjudication flag is still preserved
  expect(
    assertDefined(
      (
        await apiClient.claimAndLoadBallot({ cvrId: resolvedCrossoverCvrId })
      ).unsafeUnwrap()
    ).data.tag
  ).toEqual({ isBlankBallot: false, hasCrossoverVote: true });

  const images = await apiClient.getBallotImages({
    cvrId: unresolvedCrossoverCvrId,
  });
  expect(images.front.type).toEqual('hmpb');
  expect(images.back.type).toEqual('hmpb');
});
