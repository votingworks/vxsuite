import { Admin } from '@votingworks/api';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import {
  CVR_BALLOT_IMAGES_SUBDIRECTORY,
  loadBallotImageBase64,
} from '@votingworks/backend';
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

jest.setTimeout(30_000);

// mock SKIP_ELECTION_HASH_CHECK to allow us to use old cvr fixtures
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
    BooleanEnvironmentVariableName.SKIP_ELECTION_HASH_CHECK
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlag();
});

test('getWriteIns', async () => {
  const { apiClient, auth, workspace } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  expect(await apiClient.getWriteIns()).toHaveLength(
    workspace.store.getWriteInRecords({ electionId }).length
  );

  expect(
    await apiClient.getWriteIns({ contestId: 'zoo-council-mammal' })
  ).toHaveLength(
    workspace.store.getWriteInRecords({
      electionId,
      contestId: 'zoo-council-mammal',
    }).length
  );

  expect(await apiClient.getWriteIns({ limit: 3 })).toHaveLength(3);
});

test('transcribeWriteIn', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

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
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  expect(await apiClient.getWriteInAdjudications()).toEqual([]);

  await apiClient.createWriteInAdjudication({
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Bob',
    adjudicatedValue: 'Robert',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<Admin.WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
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
      contestId: 'zoo-council-mammal',
    })
  ).toEqual(
    typedAs<Admin.WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Bob',
        adjudicatedValue: 'Robert',
      },
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Robert',
        adjudicatedValue: 'Robert',
      },
    ])
  );
});

test('write-in adjudication lifecycle', async () => {
  const { apiClient, auth } = buildTestEnvironment();

  const { electionDefinition, castVoteRecordReport } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  // focus on this contest
  const contestId = 'zoo-council-mammal';

  // view the adjudication table
  const writeInAdjudicationTable = await apiClient.getWriteInAdjudicationTable({
    contestId,
  });
  expect(writeInAdjudicationTable).toEqual(
    typedAs<Admin.WriteInAdjudicationTable>({
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
    typedAs<Admin.WriteInAdjudicationTable>({
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
                typedAs<Partial<Admin.WriteInAdjudicationTableOptionGroup>>({
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
    typedAs<Admin.WriteInAdjudicationTable>({
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
                  typedAs<Partial<Admin.WriteInAdjudicationTableOptionGroup>>({
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
    typedAs<Admin.WriteInAdjudicationRecord[]>([
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
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [
        expect.objectContaining(
          typedAs<Partial<Admin.WriteInAdjudicationTableAdjudicatedRowGroup>>({
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
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [
        expect.objectContaining(
          typedAs<Partial<Admin.WriteInAdjudicationTableAdjudicatedRowGroup>>({
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
    typedAs<Admin.WriteInAdjudicationTable>({
      contestId,
      writeInCount,
      adjudicated: [],
      transcribed: {
        writeInCount,
        rows: [
          expect.objectContaining(
            typedAs<Partial<Admin.WriteInAdjudicationTableTranscribedRow>>({
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
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  (
    await apiClient.addCastVoteRecordFile({
      path: castVoteRecordReport.asDirectoryPath(),
    })
  ).assertOk('expected to load cast vote record report successfully');

  // focus on this contest
  const contestId = 'zoo-council-mammal';

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
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.createWriteInAdjudication({
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Zebra',
    adjudicatedValue: 'Cyclops',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<Admin.WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Cyclops',
        adjudicatedValue: 'Cyclops',
      },
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Cyclops',
      },
    ])
  );
});

test('create write-in adjudication for an official candidate', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.createWriteInAdjudication({
    contestId: 'zoo-council-mammal',
    transcribedValue: 'Zebra',
    adjudicatedValue: 'Zebra',
    adjudicatedOptionId: 'zebra',
  });

  expect(await apiClient.getWriteInAdjudications()).toEqual(
    typedAs<Admin.WriteInAdjudicationRecord[]>([
      {
        id: expect.any(String),
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      },
    ])
  );
});

test('getWriteInImage', async () => {
  const { auth, apiClient } = buildTestEnvironment();
  const { electionDefinition, castVoteRecordReportSingle } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  const reportDirectoryPath = castVoteRecordReportSingle.asDirectoryPath();
  (
    await apiClient.addCastVoteRecordFile({
      path: reportDirectoryPath,
    })
  ).assertOk('expected to load cast vote record report successfully');

  const writeIns = await apiClient.getWriteIns({
    contestId: 'County-Commissioner-d6feed25',
  });
  expect(writeIns).toHaveLength(1);

  const writeIn = writeIns[0];
  assert(writeIn);
  const writeInImageEntries = await apiClient.getWriteInImage({
    writeInId: writeIn.id,
  });
  expect(writeInImageEntries).toHaveLength(1);

  const writeInImageEntry = writeInImageEntries[0];
  assert(writeInImageEntry);
  const { image, ...coordinates } = writeInImageEntry;
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

  const expectedImage = await loadBallotImageBase64(
    join(
      reportDirectoryPath,
      CVR_BALLOT_IMAGES_SUBDIRECTORY,
      '3f1799cd-f8ae-4f6a-906a-90f56015be42',
      '33a20fb3-6a55-4e9b-a756-9b2ba622cfb6-back.jpeg-7bbc0e7d-e489-485e-b1c2-c9d54818aea2-normalized.jpg'
    )
  );
  expect(image).toEqual(expectedImage);
});
