import { Admin } from '@votingworks/api';
import {
  electionGridLayoutNewHampshireAmherstFixtures,
  electionMinimalExhaustiveSampleFixtures,
} from '@votingworks/fixtures';
import { assert, typedAs } from '@votingworks/basics';
import { CastVoteRecord } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';

beforeEach(() => {
  jest.restoreAllMocks();
});

test('getWriteIns', async () => {
  const { apiClient, auth, workspace } = await buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({
    path: standardCvrFile.asFilePath(),
  });

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
  const { apiClient, auth } = await buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({
    path: standardCvrFile.asFilePath(),
  });

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
  const { auth, apiClient } = await buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  await apiClient.addCastVoteRecordFile({ path: standardCvrFile.asFilePath() });

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
  jest.setTimeout(20_000);
  const { apiClient, auth } = await buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  await apiClient.addCastVoteRecordFile({
    path: standardCvrFile.asFilePath(),
  });

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

    // get the ballot image data for the write in
    const writeInImageEntries = await apiClient.getWriteInImage({
      writeInId: writeInRecord.id,
    });
    expect(writeInImageEntries).toHaveLength(0); // the fixtures do not have ballot images

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
  const { apiClient, auth } = await buildTestEnvironment();

  const { electionDefinition, standardCvrFile } =
    electionMinimalExhaustiveSampleFixtures;
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.electionHash);

  // upload the CVR file
  await apiClient.addCastVoteRecordFile({
    path: standardCvrFile.asFilePath(),
  });

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
  const { auth, apiClient } = await buildTestEnvironment();
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
  const { auth, apiClient } = await buildTestEnvironment();
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
  const { auth, apiClient } = await buildTestEnvironment();
  const { electionDefinition, oneBallotCastVoteRecordFile } =
    electionGridLayoutNewHampshireAmherstFixtures;
  await configureMachine(apiClient, auth, electionDefinition);

  await apiClient.addCastVoteRecordFile({
    path: oneBallotCastVoteRecordFile.asFilePath(),
  });

  const writeIns = await apiClient.getWriteIns();
  expect(writeIns).toHaveLength(9);

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
        "height": 151,
        "maxX": 1672.25,
        "maxY": 1048.75,
        "minX": 322.25,
        "minY": 898.75,
        "width": 1351,
        "x": 322.25,
        "y": 898.75,
      },
      "writeInCoordinates": Object {
        "height": 151,
        "maxX": 1672.25,
        "maxY": 1048.75,
        "minX": 1322.25,
        "minY": 898.75,
        "width": 351,
        "x": 1322.25,
        "y": 898.75,
      },
    }
  `);

  const castVoteRecord = JSON.parse(
    oneBallotCastVoteRecordFile.asText()
  ) as CastVoteRecord;
  expect(image).toEqual(castVoteRecord._ballotImages![0].normalized);
});
