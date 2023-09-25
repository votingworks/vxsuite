import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { toDataUrl, loadImage, toImageData } from '@votingworks/image-utils';
import { join } from 'path';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Id, Rect } from '@votingworks/types';
import { modifyCastVoteRecordExport } from '@votingworks/backend';
import { buildTestEnvironment, configureMachine } from '../test/app';
import { WriteInAdjudicationContext, WriteInRecord } from './types';

jest.setTimeout(30_000);

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

test('getWriteInAdjudicationQueue', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
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
    electionGridLayoutNewHampshireAmherstFixtures;
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

test('adjudicateWriteIn', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordExport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  // focus on this contest with two write-ins
  const contestId = 'Sheriff-4243fe0b';
  const contestWriteIns = await apiClient.getWriteInAdjudicationQueue({
    contestId,
  });
  expect(contestWriteIns).toHaveLength(2);

  const [writeInIdA, writeInIdB] = contestWriteIns;
  assert(writeInIdA !== undefined && writeInIdB !== undefined);

  async function getWriteIn(writeInId: Id): Promise<WriteInRecord> {
    return (await apiClient.getWriteInAdjudicationContext({ writeInId }))
      .writeIn;
  }

  expect(await getWriteIn(writeInIdA)).toMatchObject({
    contestId,
    status: 'pending',
  });

  // write-in A: adjudicate for an official candidate
  const officialCandidateId = 'Edward-Randolph-bf4c848a';
  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdA,
    type: 'official-candidate',
    candidateId: officialCandidateId,
  });

  expect(await getWriteIn(writeInIdA)).toMatchObject({
    contestId,
    adjudicationType: 'official-candidate',
    candidateId: officialCandidateId,
    status: 'adjudicated',
  });
  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 1,
      totalTally: 2,
    },
  ]);

  // write-in A: re-adjudicate as invalid
  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdA,
    type: 'invalid',
  });

  expect(await getWriteIn(writeInIdA)).toMatchObject({
    contestId,
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 1,
      totalTally: 2,
    },
  ]);

  // write-in A: re-adjudicate for the official candidate
  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdA,
    type: 'official-candidate',
    candidateId: officialCandidateId,
  });

  expect(await getWriteIn(writeInIdA)).toMatchObject({
    contestId,
    adjudicationType: 'official-candidate',
    candidateId: officialCandidateId,
    status: 'adjudicated',
  });
  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 1,
      totalTally: 2,
    },
  ]);

  // write-in B: add and adjudicate for a write-in candidate
  expect(await apiClient.getWriteInCandidates()).toMatchObject([]);

  await apiClient.addWriteInCandidate({ contestId, name: 'Mr. Pickles' });
  expect(await apiClient.getWriteInCandidates()).toMatchObject([
    { contestId, name: 'Mr. Pickles' },
  ]);
  const [mrPickles] = await apiClient.getWriteInCandidates();

  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdB,
    type: 'write-in-candidate',
    candidateId: mrPickles!.id,
  });

  expect(await getWriteIn(writeInIdB)).toMatchObject({
    contestId,
    adjudicationType: 'write-in-candidate',
    candidateId: mrPickles!.id,
    status: 'adjudicated',
  });

  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 0,
      totalTally: 2,
    },
  ]);

  // write-in B: re-adjudicate for a different write-in candidate
  await apiClient.addWriteInCandidate({ contestId, name: 'Pickles Jr.' });
  expect(await apiClient.getWriteInCandidates()).toMatchObject([
    { contestId, name: 'Mr. Pickles' },
    { contestId, name: 'Pickles Jr.' },
  ]);
  const [, picklesJr] = await apiClient.getWriteInCandidates();

  await apiClient.adjudicateWriteIn({
    writeInId: writeInIdB,
    type: 'write-in-candidate',
    candidateId: picklesJr!.id,
  });

  expect(await getWriteIn(writeInIdB)).toMatchObject({
    contestId,
    adjudicationType: 'write-in-candidate',
    status: 'adjudicated',
    candidateId: picklesJr!.id,
  });

  expect(
    await apiClient.getWriteInAdjudicationQueueMetadata({ contestId })
  ).toEqual([
    {
      contestId,
      pendingTally: 0,
      totalTally: 2,
    },
  ]);

  // now that Mr. Pickles has no adjudications, he should have been removed as a write-in candidate
  expect(await apiClient.getWriteInCandidates({ contestId })).toMatchObject([
    { name: 'Pickles Jr.' },
  ]);
});

test('getWriteInAdjudicationContext', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
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

test('getWriteInImageView', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, manualCastVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
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
  } = writeInImageViewA;

  const expectedBallotCoordinates: Rect = {
    height: 2200,
    width: 1696,
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

  const expectedImage = await loadImage(
    join(
      reportDirectoryPath,
      '864a2854-ee26-4223-8097-9633b7bed096',
      '864a2854-ee26-4223-8097-9633b7bed096-front.jpg'
    )
  );
  const expectedImageUrl = toDataUrl(
    toImageData(expectedImage, {
      maxWidth: expectedImage.width,
      maxHeight: expectedImage.height,
    }),
    'image/jpeg'
  );
  expect(actualImageUrl).toEqual(expectedImageUrl);

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
  } = writeInImageViewB1;
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

test('getFirstPendingWriteInId', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordExport } =
    electionGridLayoutNewHampshireAmherstFixtures;
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
