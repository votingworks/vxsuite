import { electionGridLayoutNewHampshireAmherstFixtures } from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { CVR_BALLOT_IMAGES_SUBDIRECTORY } from '@votingworks/backend';
import { toDataUrl, loadImage, toImageData } from '@votingworks/image-utils';
import { join } from 'path';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import {
  WriteInAdjudicationRecord,
  WriteInAdjudicationTable,
  WriteInAdjudicationTableAdjudicatedRowGroup,
  WriteInAdjudicationTableOptionGroup,
  WriteInAdjudicationTableTranscribedRow,
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
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('cast vote record failed to load in test setup');

  expect(await apiClient.getWriteIns()).toHaveLength(80);

  expect(
    await apiClient.getWriteIns({ contestId: 'Governor-061a401b' })
  ).toHaveLength(2);

  expect(await apiClient.getWriteIns({ limit: 3 })).toHaveLength(3);
});

test('transcribeWriteIn', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('cast vote record failed to load in test setup');

  const [writeInRecord] = await apiClient.getWriteIns({ limit: 1 });
  assert(writeInRecord);

  const writeInRecords1 = await apiClient.getWriteIns();
  expect(new Set(writeInRecords1.map(({ status }) => status))).toEqual(
    new Set(['pending'])
  );

  await apiClient.transcribeWriteIn({
    writeInId: writeInRecord.id,
    transcribedValue: 'Mickey Mouse',
  });

  const writeInRecords2 = await apiClient.getWriteIns();

  expect(new Set(writeInRecords2.map(({ status }) => status))).toEqual(
    new Set(['pending', 'transcribed'])
  );
});

test('getWriteInAdjudications', async () => {
  const { auth, apiClient } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('cast vote record failed to load in test setup');

  expect(await apiClient.getWriteInAdjudications()).toEqual([]);

  await apiClient.createWriteInAdjudication({
    contestId: 'Governor-061a401b',
    transcribedValue: 'Bob',
    adjudicatedValue: 'Robert',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'Governor-061a401b',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'Governor-061a401b',
        transcribedValue: 'Robert',
        adjudicatedValue: 'Robert',
      },
    ])
  );

  // mismatched filter
  expect(
    await apiClient.getWriteInAdjudications({ contestId: 'zoo-council-fish' })
  ).toEqual([]);

  // matched filter
  expect(
    await apiClient.getWriteInAdjudications({
      contestId: 'Governor-061a401b',
    })
  ).toEqual(
    typedAs<WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'Governor-061a401b',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'Governor-061a401b',
        transcribedValue: 'Robert',
        adjudicatedValue: 'Robert',
      },
    ])
  );
});

test('write-in adjudication lifecycle', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('cast vote record failed to load in test setup');

  // focus on this contest
  const contestId = 'Governor-061a401b';

  // view the adjudication table
  const writeInAdjudicationTable = await apiClient.getWriteInAdjudicationTable({
    contestId,
  });
  expect(writeInAdjudicationTable).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount: 0,
      adjudicated: [],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );

  // process all the write-ins for the contest we're going to adjudicate
  let writeInCount = 0;
  for (;;) {
    const pendingWriteIn = await apiClient.getWriteIns({
      status: 'pending',
      contestId,
      limit: 1,
    });

    if (pendingWriteIn.length === 0) {
      break;
    }

    const writeInRecord = pendingWriteIn[0]!;

    // transcribe it
    await apiClient.transcribeWriteIn({
      writeInId: writeInRecord.id,
      transcribedValue: 'Mickey Mouse',
    });

    writeInCount += 1;
  }

  // view the adjudication table
  const writeInAdjudicationTableAfterTranscription =
    await apiClient.getWriteInAdjudicationTable({
      contestId,
    });

  expect(writeInAdjudicationTableAfterTranscription).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [],
      transcribed: {
        writeInCount,
        rows: [
          {
            transcribedValue: 'Mickey Mouse',
            writeInCount,
            adjudicationOptionGroups: [
              expect.objectContaining(
                typedAs<Partial<WriteInAdjudicationTableOptionGroup>>({
                  title: 'Official Candidates',
                })
              ),
              {
                title: 'Write-In Candidates',
                options: [
                  {
                    adjudicatedValue: 'Mickey Mouse',
                    enabled: true,
                  },
                ],
              },
            ],
          },
        ],
      },
    })
  );

  const writeInAdjudicationsAfterTranscription =
    await apiClient.getWriteInAdjudications({ contestId });

  expect(writeInAdjudicationsAfterTranscription).toEqual([]);

  // adjudicate all "Mickey Mouse" transcribed write-ins as "Mickey Mouse"
  await apiClient.createWriteInAdjudication({
    contestId,
    transcribedValue: 'Mickey Mouse',
    adjudicatedValue: 'Mickey Mouse',
  });

  // view the adjudication table
  const writeInAdjudicationTableAfterAdjudication =
    await apiClient.getWriteInAdjudicationTable({ contestId });
  expect(writeInAdjudicationTableAfterAdjudication).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [
        {
          adjudicatedValue: 'Mickey Mouse',
          writeInCount,
          rows: [
            {
              transcribedValue: 'Mickey Mouse',
              writeInAdjudicationId: expect.any(String),
              writeInCount,
              editable: true,
              adjudicationOptionGroups: [
                expect.objectContaining(
                  typedAs<Partial<WriteInAdjudicationTableOptionGroup>>({
                    title: 'Official Candidates',
                  })
                ),
                {
                  title: 'Write-In Candidates',
                  options: [
                    {
                      adjudicatedValue: 'Mickey Mouse',
                      enabled: true,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );

  const writeInAdjudicationsAfterAdjuducation =
    await apiClient.getWriteInAdjudications({ contestId });

  expect(writeInAdjudicationsAfterAdjuducation).toEqual(
    typedAs<WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId,
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Mickey Mouse',
      },
    ])
  );

  const writeInAdjudicationId =
    writeInAdjudicationTableAfterAdjudication.adjudicated[0]?.rows[0]
      ?.writeInAdjudicationId;
  assert(typeof writeInAdjudicationId === 'string');

  // update the adjudication
  await apiClient.updateWriteInAdjudication({
    writeInAdjudicationId,
    adjudicatedValue: 'Modest Mouse',
  });

  // view the adjudication table
  const writeInAdjudicationTableAfterUpdate =
    await apiClient.getWriteInAdjudicationTable({ contestId });
  expect(writeInAdjudicationTableAfterUpdate).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [
        expect.objectContaining(
          typedAs<Partial<WriteInAdjudicationTableAdjudicatedRowGroup>>({
            adjudicatedValue: 'Modest Mouse',
          })
        ),
      ],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );

  // update the adjudication again, to official candidate
  await apiClient.updateWriteInAdjudication({
    writeInAdjudicationId,
    adjudicatedValue: 'Zebra',
    adjudicatedOptionId: 'zebra',
  });

  // view the adjudication table
  const writeInAdjudicationTableAfterUpdateAgain =
    await apiClient.getWriteInAdjudicationTable({ contestId });
  expect(writeInAdjudicationTableAfterUpdateAgain).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [
        expect.objectContaining(
          typedAs<Partial<WriteInAdjudicationTableAdjudicatedRowGroup>>({
            adjudicatedValue: 'Zebra',
            adjudicatedOptionId: 'zebra',
          })
        ),
      ],
      transcribed: {
        writeInCount: 0,
        rows: [],
      },
    })
  );

  // delete the adjudication
  await apiClient.deleteWriteInAdjudication({ writeInAdjudicationId });

  // view the adjudication table
  const writeInAdjudicationTableAfterDelete =
    await apiClient.getWriteInAdjudicationTable({ contestId });
  expect(writeInAdjudicationTableAfterDelete).toEqual(
    typedAs<WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [],
      transcribed: {
        writeInCount,
        rows: [
          expect.objectContaining(
            typedAs<Partial<WriteInAdjudicationTableTranscribedRow>>({
              transcribedValue: 'Mickey Mouse',
              writeInCount,
            })
          ),
        ],
      },
    })
  );
});

test('write-in summary filtered by contestId & status', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('cast vote record failed to load in test setup');

  // focus on this contest
  const contestId = 'Governor-061a401b';

  const pendingWriteInSummary = await apiClient.getWriteInSummary({
    contestId,
    status: 'pending',
  });
  expect(pendingWriteInSummary).toHaveLength(1);

  const transcribedWriteInSummary = await apiClient.getWriteInSummary({
    contestId,
    status: 'transcribed',
  });
  expect(transcribedWriteInSummary).toHaveLength(0);

  const adjudicatedWriteInSummary = await apiClient.getWriteInSummary({
    contestId,
    status: 'transcribed',
  });
  expect(adjudicatedWriteInSummary).toHaveLength(0);
});

test('create write-in adjudication for an unlisted candidate', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.createWriteInAdjudication({
    contestId: 'governor-061a401b',
    transcribedValue: 'Zebra',
    adjudicatedValue: 'Cyclops',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'governor-061a401b',
        transcribedValue: 'Cyclops',
        adjudicatedValue: 'Cyclops',
      },
      {
        id: expect.any(String),
        contestId: 'governor-061a401b',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Cyclops',
      },
    ])
  );
});

test('create write-in adjudication for an official candidate', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition } = electionGridLayoutNewHampshireAmherstFixtures;

  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.createWriteInAdjudication({
    contestId: 'governor-061a401b',
    transcribedValue: 'Zebra',
    adjudicatedValue: 'Zebra',
    adjudicatedOptionId: 'zebra',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'governor-061a401b',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      },
    ])
  );
});

test('getWriteInImage', async () => {
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
