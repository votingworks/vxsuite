import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { CVR_BALLOT_IMAGES_SUBDIRECTORY } from '@votingworks/backend';
import { toDataUrl, loadImage, toImageData } from '@votingworks/image-utils';
import { join } from 'path';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { buildTestEnvironment, configureMachine } from '../test/app';
import {
  WriteInSummaryEntryAdjudicated,
  WriteInSummaryEntryAdjudicatedInvalid,
  WriteInSummaryEntryAdjudicatedOfficialCandidate,
  WriteInSummaryEntryAdjudicatedWriteInCandidate,
  WriteInSummaryEntryPending,
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

test('getWriteInSummary', async () => {
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

  const allWriteInSummaries = await apiClient.getWriteInSummary();
  expect(allWriteInSummaries).toHaveLength(contestsWithWriteIns.length);
  assert(allWriteInSummaries.every((summary) => summary.status === 'pending'));

  expect(await apiClient.getWriteInSummary({ status: 'pending' })).toHaveLength(
    contestsWithWriteIns.length
  );
  expect(
    await apiClient.getWriteInSummary({ status: 'adjudicated' })
  ).toHaveLength(0);

  expect(
    await apiClient.getWriteInSummary({
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
  expect(await apiClient.getWriteInSummary({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInSummaryEntryAdjudicatedOfficialCandidate>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        writeInCount: 1,
      }),
      typedAs<WriteInSummaryEntryPending>({
        contestId,
        status: 'pending',
        writeInCount: 1,
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
  expect(await apiClient.getWriteInSummary({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInSummaryEntryAdjudicatedInvalid>({
        contestId,
        adjudicationType: 'invalid',
        status: 'adjudicated',
        writeInCount: 1,
      }),
      typedAs<WriteInSummaryEntryPending>({
        contestId,
        status: 'pending',
        writeInCount: 1,
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
  expect(await apiClient.getWriteInSummary({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInSummaryEntryAdjudicated>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        writeInCount: 1,
      }),
      typedAs<WriteInSummaryEntryPending>({
        contestId,
        status: 'pending',
        writeInCount: 1,
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

  expect(await apiClient.getWriteInSummary({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInSummaryEntryAdjudicatedOfficialCandidate>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        writeInCount: 1,
      }),
      typedAs<WriteInSummaryEntryAdjudicatedWriteInCandidate>({
        contestId,
        adjudicationType: 'write-in-candidate',
        candidateId: mrPickles!.id,
        candidateName: 'Mr. Pickles',
        status: 'adjudicated',
        writeInCount: 1,
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

  expect(await apiClient.getWriteInSummary({ contestId })).toMatchObject(
    expect.arrayContaining([
      typedAs<WriteInSummaryEntryAdjudicatedOfficialCandidate>({
        contestId,
        adjudicationType: 'official-candidate',
        candidateId: officialCandidateId,
        candidateName: 'Edward Randolph',
        status: 'adjudicated',
        writeInCount: 1,
      }),
      typedAs<WriteInSummaryEntryAdjudicatedWriteInCandidate>({
        contestId,
        adjudicationType: 'write-in-candidate',
        candidateId: picklesJr!.id,
        candidateName: 'Pickles Jr.',
        status: 'adjudicated',
        writeInCount: 1,
      }),
    ])
  );

  // now that Mr. Pickles has no adjudications, he should have been removed as a write-in candidate
  expect(await apiClient.getWriteInCandidates({ contestId })).toMatchObject([
    { name: 'Pickles Jr.' },
  ]);
});

test('getWriteInImageView', async () => {
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

  const writeIns = await apiClient.getWriteIns({
    contestId: 'County-Commissioner-d6feed25',
  });
  expect(writeIns).toHaveLength(1);

  const writeIn = writeIns[0];
  assert(writeIn);
  const writeInImageView = await apiClient.getWriteInImageView({
    writeInId: writeIn.id,
  });
  assert(writeInImageView);

  const { imageUrl: actualImageUrl, ...coordinates } = writeInImageView;
  expect(coordinates).toMatchInlineSnapshot(`
    Object {
      "ballotCoordinates": Object {
        "height": 2200,
        "width": 1696,
        "x": 0,
        "y": 0,
      },
      "contestCoordinates": Object {
        "height": 99,
        "width": 1331,
        "x": 251,
        "y": 1008,
      },
      "writeInCoordinates": Object {
        "height": 93,
        "width": 443,
        "x": 1139,
        "y": 1014,
      },
    }
  `);

  const expectedImage = await loadImage(
    join(
      reportDirectoryPath,
      CVR_BALLOT_IMAGES_SUBDIRECTORY,
      '3f1799cd-f8ae-4f6a-906a-90f56015be42',
      '33a20fb3-6a55-4e9b-a756-9b2ba622cfb6-back.jpeg-7bbc0e7d-e489-485e-b1c2-c9d54818aea2-normalized.jpg'
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
});
