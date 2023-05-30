import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { CVR_BALLOT_IMAGES_SUBDIRECTORY } from '@votingworks/backend';
import { toDataUrl, loadImage, toImageData } from '@votingworks/image-utils';
import { join } from 'path';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Rect } from '@votingworks/types';
import { buildTestEnvironment, configureMachine } from '../test/app';
import {
  WriteInDetailView,
  WriteInAdjudicatedTally,
  WriteInAdjudicatedInvalidTally,
  WriteInAdjudicatedOfficialCandidateTally,
  WriteInAdjudicatedWriteInCandidateTally,
  WriteInPendingTally,
} from './types';

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
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('getWriteIns', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const allWriteIns = await apiClient.getWriteIns();
  expect(allWriteIns).toHaveLength(80);
  assert(allWriteIns.every((writeIn) => writeIn.status === 'pending'));

  expect(await apiClient.getWriteIns({ status: 'pending' })).toHaveLength(80);
  expect(await apiClient.getWriteIns({ status: 'adjudicated' })).toHaveLength(
    0
  );

  expect(await apiClient.getWriteIns({ limit: 3 })).toHaveLength(3);

  expect(
    await apiClient.getWriteIns({
      contestId: 'Sheriff-4243fe0b',
    })
  ).toHaveLength(2);
});

test('getWriteInTallies', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  const contestsWithWriteIns = electionDefinition.election.contests.filter(
    (contest) => contest.type === 'candidate' && contest.allowWriteIns
  );

  const allWriteInSummaries = await apiClient.getWriteInTallies();
  expect(allWriteInSummaries).toHaveLength(contestsWithWriteIns.length);
  assert(allWriteInSummaries.every((summary) => summary.status === 'pending'));

  expect(await apiClient.getWriteInTallies({ status: 'pending' })).toHaveLength(
    contestsWithWriteIns.length
  );
  expect(
    await apiClient.getWriteInTallies({ status: 'adjudicated' })
  ).toHaveLength(0);

  expect(
    await apiClient.getWriteInTallies({
      contestId: 'Sheriff-4243fe0b',
    })
  ).toHaveLength(1);
});

test('e2e write-in adjudication', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).unsafeUnwrap();

  // focus on this contest with two of write-ins
  const contestId = 'Sheriff-4243fe0b';
  const contestWriteIns = await apiClient.getWriteIns({ contestId });
  expect(contestWriteIns).toHaveLength(2);

  const [writeInA1, writeInB1] = contestWriteIns;
  assert(writeInA1 && writeInB1);
  expect(writeInA1).toMatchObject({
    contestId,
    status: 'pending',
  });

  // write-in A: adjudicate for an official candidate
  const officialCandidateId = 'Edward-Randolph-bf4c848a';
  await apiClient.adjudicateWriteIn({
    writeInId: writeInA1.id,
    type: 'official-candidate',
    candidateId: officialCandidateId,
  });

  const [writeInA2] = await apiClient.getWriteIns({ contestId });
  expect(writeInA2).toMatchObject({
    contestId,
    adjudicationType: 'official-candidate',
    candidateId: officialCandidateId,
    status: 'adjudicated',
  });
  expect(await apiClient.getWriteInTallies({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInAdjudicatedOfficialCandidateTally>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        tally: 1,
      }),
      typedAs<WriteInPendingTally>({
        contestId,
        status: 'pending',
        tally: 1,
      }),
    ])
  );

  // write-in A: re-adjudicate as invalid
  await apiClient.adjudicateWriteIn({
    writeInId: writeInA1.id,
    type: 'invalid',
  });

  const [writeInA3] = await apiClient.getWriteIns({ contestId });
  expect(writeInA3).toMatchObject({
    contestId,
    adjudicationType: 'invalid',
    status: 'adjudicated',
  });
  expect(await apiClient.getWriteInTallies({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInAdjudicatedInvalidTally>({
        contestId,
        adjudicationType: 'invalid',
        status: 'adjudicated',
        tally: 1,
      }),
      typedAs<WriteInPendingTally>({
        contestId,
        status: 'pending',
        tally: 1,
      }),
    ])
  );

  // write-in A: re-adjudicate for the official candidate
  await apiClient.adjudicateWriteIn({
    writeInId: writeInA1.id,
    type: 'official-candidate',
    candidateId: officialCandidateId,
  });

  const [writeInA4] = await apiClient.getWriteIns({ contestId });
  expect(writeInA4).toMatchObject({
    contestId,
    adjudicationType: 'official-candidate',
    candidateId: officialCandidateId,
    status: 'adjudicated',
  });
  expect(await apiClient.getWriteInTallies({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInAdjudicatedTally>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        tally: 1,
      }),
      typedAs<WriteInPendingTally>({
        contestId,
        status: 'pending',
        tally: 1,
      }),
    ])
  );

  // write-in B: add and adjudicate for a write-in candidate
  expect(await apiClient.getWriteInCandidates()).toMatchObject([]);

  await apiClient.addWriteInCandidate({ contestId, name: 'Mr. Pickles' });
  expect(await apiClient.getWriteInCandidates()).toMatchObject([
    { contestId, name: 'Mr. Pickles' },
  ]);
  const [mrPickles] = await apiClient.getWriteInCandidates();

  await apiClient.adjudicateWriteIn({
    writeInId: writeInB1.id,
    type: 'write-in-candidate',
    candidateId: mrPickles!.id,
  });

  const [, writeInB2] = await apiClient.getWriteIns({ contestId });
  expect(writeInB2).toMatchObject({
    contestId,
    adjudicationType: 'write-in-candidate',
    candidateId: mrPickles!.id,
    status: 'adjudicated',
  });

  expect(await apiClient.getWriteInTallies({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInAdjudicatedOfficialCandidateTally>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        tally: 1,
      }),
      typedAs<WriteInAdjudicatedWriteInCandidateTally>({
        contestId,
        adjudicationType: 'write-in-candidate',
        candidateId: mrPickles!.id,
        candidateName: 'Mr. Pickles',
        status: 'adjudicated',
        tally: 1,
      }),
    ])
  );

  // write-in B: re-adjudicate for a different write-in candidate
  await apiClient.addWriteInCandidate({ contestId, name: 'Pickles Jr.' });
  expect(await apiClient.getWriteInCandidates()).toMatchObject([
    { contestId, name: 'Mr. Pickles' },
    { contestId, name: 'Pickles Jr.' },
  ]);
  const [, picklesJr] = await apiClient.getWriteInCandidates();

  await apiClient.adjudicateWriteIn({
    writeInId: writeInB1.id,
    type: 'write-in-candidate',
    candidateId: picklesJr!.id,
  });

  const [, writeInB3] = await apiClient.getWriteIns({ contestId });
  expect(writeInB3).toMatchObject({
    contestId,
    adjudicationType: 'write-in-candidate',
    status: 'adjudicated',
    candidateId: picklesJr!.id,
  });

  expect(await apiClient.getWriteInTallies({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInAdjudicatedOfficialCandidateTally>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        tally: 1,
      }),
      typedAs<WriteInAdjudicatedWriteInCandidateTally>({
        contestId,
        adjudicationType: 'write-in-candidate',
        candidateId: picklesJr!.id,
        candidateName: 'Pickles Jr.',
        status: 'adjudicated',
        tally: 1,
      }),
    ])
  );

  // now that Mr. Pickles has no adjudications, he should have been removed as a write-in candidate
  expect(await apiClient.getWriteInCandidates({ contestId })).toMatchObject([
    { name: 'Pickles Jr.' },
  ]);
});

test('getWriteInDetailView', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, manualCastVoteRecordReportSingle } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath =
    manualCastVoteRecordReportSingle.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).unsafeUnwrap();

  // look at a contest with multiple write-ins possible
  const contestId = 'State-Representatives-Hillsborough-District-34-b1012d38';
  const writeIns = await apiClient.getWriteIns({
    contestId,
  });
  expect(writeIns).toHaveLength(2);

  const [writeInA, writeInB] = writeIns;
  assert(writeInA && writeInB);

  // check initial view of first write-in
  const writeInDetailViewA = await apiClient.getWriteInDetailView({
    writeInId: writeInA.id,
  });
  assert(writeInDetailViewA);

  expect(writeInDetailViewA).toMatchObject(
    typedAs<Partial<WriteInDetailView>>({
      markedOfficialCandidateIds: ['Obadiah-Carrigan-5c95145a'],
      writeInAdjudicatedOfficialCandidateIds: [],
      writeInAdjudicatedWriteInCandidateIds: [],
    })
  );

  const {
    imageUrl: actualImageUrl,
    ballotCoordinates: ballotCoordinatesA,
    contestCoordinates: contestCoordinatesA,
    writeInCoordinates: writeInCoordinatesA,
  } = writeInDetailViewA;

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
    Object {
      "height": 140,
      "width": 270,
      "x": 1327,
      "y": 1274,
    }
  `);

  const expectedImage = await loadImage(
    join(
      reportDirectoryPath,
      CVR_BALLOT_IMAGES_SUBDIRECTORY,
      '378f6a69-62d3-4184-a1a7-3a5d90083e21',
      'a6f30699-8d95-462c-b1d2-fc078048f760-front.jpeg-864a2854-ee26-4223-8097-9633b7bed096-normalized.jpg'
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

  // adjudicate first write-in for an official candidate
  await apiClient.adjudicateWriteIn({
    writeInId: writeInA.id,
    type: 'official-candidate',
    candidateId: 'Mary-Baker-Eddy-350785d5',
  });

  // check the second write-in detail view, which should the just-adjudicated write-in
  const writeInDetailViewB1 = await apiClient.getWriteInDetailView({
    writeInId: writeInB.id,
  });

  expect(writeInDetailViewB1).toMatchObject(
    typedAs<Partial<WriteInDetailView>>({
      markedOfficialCandidateIds: ['Obadiah-Carrigan-5c95145a'],
      writeInAdjudicatedOfficialCandidateIds: ['Mary-Baker-Eddy-350785d5'],
      writeInAdjudicatedWriteInCandidateIds: [],
    })
  );

  // contest and ballot coordinates should be the same, but write-in coordinates are different
  const {
    ballotCoordinates: ballotCoordinatesB,
    contestCoordinates: contestCoordinatesB,
    writeInCoordinates: writeInCoordinatesB,
  } = writeInDetailViewB1;
  expect(ballotCoordinatesB).toEqual(expectedBallotCoordinates);
  expect(contestCoordinatesB).toEqual(expectedContestCoordinates);
  expect(writeInCoordinatesB).toMatchInlineSnapshot(`
    Object {
      "height": 138,
      "width": 269,
      "x": 1328,
      "y": 1366,
    }
  `);

  // re-adjudicate the first write-in for a write-in candidate and expect the id's to change
  const { id: writeInCandidateId } = await apiClient.addWriteInCandidate({
    contestId,
    name: 'Bob Hope',
  });
  await apiClient.adjudicateWriteIn({
    writeInId: writeInA.id,
    type: 'write-in-candidate',
    candidateId: writeInCandidateId,
  });
  const writeInDetailViewB2 = await apiClient.getWriteInDetailView({
    writeInId: writeInB.id,
  });

  expect(writeInDetailViewB2).toMatchObject(
    typedAs<Partial<WriteInDetailView>>({
      markedOfficialCandidateIds: ['Obadiah-Carrigan-5c95145a'],
      writeInAdjudicatedOfficialCandidateIds: [],
      writeInAdjudicatedWriteInCandidateIds: [writeInCandidateId],
    })
  );
});
