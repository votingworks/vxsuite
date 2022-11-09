import { Admin } from '@votingworks/api';
import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleFixtures,
  electionWithMsEitherNeitherFixtures,
} from '@votingworks/fixtures';
import { fakeLogger } from '@votingworks/logging';
import {
  ExternalTallySourceType,
  Id,
  safeParse,
  safeParseJson,
  VotingMethod,
} from '@votingworks/types';
import { MemoryStorage, typedAs } from '@votingworks/utils';
import fetchMock from 'fetch-mock';
import { convertTalliesByPrecinctToFullExternalTally } from '../../utils/external_tallies';
import { ElectionManagerStoreAdminBackend } from './admin_backend';
import { ElectionManagerStoreMemoryBackend } from './memory_backend';

function makeMemoryBackend(): ElectionManagerStoreMemoryBackend {
  // disallow network access for in-memory backend
  fetchMock.reset().mock('*', (url) => {
    throw new Error(`Unexpected fetch: ${url}`);
  });

  return new ElectionManagerStoreMemoryBackend();
}

function makeAdminBackend(): ElectionManagerStoreAdminBackend {
  const storage = new MemoryStorage();
  const logger = fakeLogger();

  let nextElectionIndex = 1;
  const db = new Map<
    Id,
    {
      electionRecord: Admin.ElectionRecord;
      memoryBackend: ElectionManagerStoreMemoryBackend;
    }
  >();

  fetchMock
    .reset()
    .get('/admin/elections', () => ({
      body: typedAs<Admin.GetElectionsResponse>(
        Array.from(db.values()).map(({ electionRecord }) => electionRecord)
      ),
    }))
    .post('/admin/elections', (url, request) => {
      const electionId = `test-election-${nextElectionIndex}`;
      nextElectionIndex += 1;
      const electionDefinition = safeParseJson(
        request.body as string,
        Admin.PostElectionRequestSchema
      ).unsafeUnwrap();
      db.set(electionId, {
        electionRecord: {
          id: electionId,
          electionDefinition,
          createdAt: new Date().toISOString(),
          isOfficialResults: false,
        },
        memoryBackend: new ElectionManagerStoreMemoryBackend({
          electionId,
          electionDefinition,
        }),
      });
      return {
        body: typedAs<Admin.PostElectionResponse>({
          status: 'ok',
          id: electionId,
        }),
      };
    })
    .patch('glob:/admin/elections/*', (url, request) => {
      const match = url.match(/^\/admin\/elections\/(.+)$/);
      const electionId = match?.[1] as Id;
      const dbEntry = electionId && db.get(electionId);

      if (!dbEntry) {
        return { status: 404 };
      }

      const body = safeParseJson(
        request.body as string,
        Admin.PatchElectionRequestSchema
      ).unsafeUnwrap();

      if (typeof body.isOfficialResults === 'boolean') {
        dbEntry.electionRecord = {
          ...dbEntry.electionRecord,
          isOfficialResults: body.isOfficialResults,
        };
      }

      return { body: typedAs<Admin.PatchElectionResponse>({ status: 'ok' }) };
    })
    .delete('glob:/admin/elections/*', (url) => {
      const match = url.match(/^\/admin\/elections\/(.+)$/);
      db.delete(match?.[1] ?? '');
      return { body: typedAs<Admin.DeleteElectionResponse>({ status: 'ok' }) };
    })
    .post('glob:/admin/elections/*/cvr-files', async (url, request) => {
      const match = url.match(/^\/admin\/elections\/(.+)\/cvr-files$/);
      const body = request.body as FormData;
      const cvrFile = body.get('cvrFile') as File | undefined;

      const electionId = match?.[1] as Id;
      const dbEntry = electionId && db.get(electionId);

      if (!dbEntry || !cvrFile) {
        return { status: 404 };
      }

      const result = await dbEntry.memoryBackend.addCastVoteRecordFile(cvrFile);

      return {
        body: typedAs<Admin.PostCvrFileResponse>({
          status: 'ok',
          id: `${electionId}-${cvrFile.name}`.replaceAll('.', '_'),
          wasExistingFile: result.wasExistingFile,
          newlyAdded: result.newlyAdded,
          alreadyPresent: result.alreadyPresent,
        }),
      };
    })
    .get('glob:/admin/elections/*/write-ins\\?*', async (url) => {
      const match = url.match(/^\/admin\/elections\/(.+)\/write-ins(\?.*)?$/);
      const electionId = match?.[1] as Id;
      const dbEntry = electionId && db.get(electionId);
      const query = new URLSearchParams(match?.[2] ?? '');

      if (!dbEntry) {
        return { status: 404 };
      }

      return {
        body: typedAs<Admin.GetWriteInsResponse>(
          (await dbEntry.memoryBackend.loadWriteIns(
            safeParse(Admin.GetWriteInsQueryParamsSchema, {
              contestId: query.get('contestId') ?? undefined,
              status: query.get('status') ?? undefined,
            }).unsafeUnwrap()
          )) ?? []
        ),
      };
    })
    .put('glob:/admin/write-ins/*/transcription', async (url, request) => {
      const match = url.match(/^\/admin\/write-ins\/(.+)\/transcription$/);
      const writeInId = match?.[1] as Id;
      const body = safeParseJson(
        request.body as string,
        Admin.PutWriteInTranscriptionRequestSchema
      ).unsafeUnwrap();

      for (const dbEntry of db.values()) {
        const writeIns = await dbEntry.memoryBackend.loadWriteIns();

        if (writeIns.some((writeIn) => writeIn.id === writeInId)) {
          await dbEntry.memoryBackend.transcribeWriteIn(writeInId, body.value);
          return {
            body: typedAs<Admin.PutWriteInTranscriptionResponse>({
              status: 'ok',
            }),
          };
        }
      }

      return { status: 404 };
    })
    .get('glob:/admin/elections/*/write-in-adjudications\\?*', async (url) => {
      const match = url.match(
        /^\/admin\/elections\/(.+)\/write-in-adjudications(\?.*)?$/
      );
      const electionId = match?.[1] as Id;
      const query = new URLSearchParams(match?.[2] ?? '');
      const dbEntry = electionId && db.get(electionId);

      if (!dbEntry) {
        return { status: 404 };
      }

      const parseQueryResult = safeParse(
        Admin.GetWriteInAdjudicationsQueryParamsSchema,
        { contestId: query.get('contestId') ?? undefined }
      );

      if (parseQueryResult.isErr()) {
        return { status: 400 };
      }

      return {
        body: typedAs<Admin.GetWriteInAdjudicationsResponse>(
          await dbEntry.memoryBackend.loadWriteInAdjudications(
            parseQueryResult.ok()
          )
        ),
      };
    })
    .post(
      'glob:/admin/elections/*/write-in-adjudications',
      async (url, request) => {
        const match = url.match(
          /^\/admin\/elections\/(.+)\/write-in-adjudications$/
        );
        const electionId = match?.[1] as Id;
        const dbEntry = electionId && db.get(electionId);
        const body = safeParseJson(
          request.body as string,
          Admin.PostWriteInAdjudicationRequestSchema
        ).unsafeUnwrap();

        if (!dbEntry) {
          return { status: 404 };
        }

        const id = await dbEntry.memoryBackend.adjudicateWriteInTranscription(
          body.contestId,
          body.transcribedValue,
          body.adjudicatedValue,
          body.adjudicatedOptionId
        );

        return {
          body: typedAs<Admin.PostWriteInAdjudicationResponse>({
            status: 'ok',
            id,
          }),
        };
      }
    )
    .put('glob:/admin/write-in-adjudications/*', async (url, request) => {
      const match = url.match(/^\/admin\/write-in-adjudications\/(.+)$/);
      const adjudicationId = match?.[1] as Id;
      const body = safeParseJson(
        request.body as string,
        Admin.PutWriteInAdjudicationRequestSchema
      ).unsafeUnwrap();

      for (const dbEntry of db.values()) {
        const writeInAdjudications =
          await dbEntry.memoryBackend.loadWriteInAdjudications();

        if (
          writeInAdjudications.some(
            (adjudication) => adjudication.id === adjudicationId
          )
        ) {
          await dbEntry.memoryBackend.updateWriteInAdjudication(
            adjudicationId,
            body.adjudicatedValue,
            body.adjudicatedOptionId
          );
          return {
            body: typedAs<Admin.PutWriteInAdjudicationResponse>({
              status: 'ok',
            }),
          };
        }
      }

      return { status: 404 };
    })
    .delete('glob:/admin/write-in-adjudications/*', async (url) => {
      const match = url.match(/^\/admin\/write-in-adjudications\/(.+)$/);
      const adjudicationId = match?.[1] as Id;

      for (const dbEntry of db.values()) {
        const writeInAdjudications =
          await dbEntry.memoryBackend.loadWriteInAdjudications();

        if (
          writeInAdjudications.some(
            (adjudication) => adjudication.id === adjudicationId
          )
        ) {
          await dbEntry.memoryBackend.deleteWriteInAdjudication(adjudicationId);
          return {
            body: typedAs<Admin.DeleteWriteInAdjudicationResponse>({
              status: 'ok',
            }),
          };
        }
      }

      return { status: 404 };
    })
    .get('glob:/admin/elections/*/printed-ballots\\?*', async (url) => {
      const match = url.match(
        /^\/admin\/elections\/(.+)\/printed-ballots(\?.*)?$/
      );
      const electionId = match?.[1] as Id;
      const dbEntry = db.get(electionId);
      const query = new URLSearchParams(match?.[2] ?? '');

      if (!dbEntry) {
        return { status: 404 };
      }

      const parseQueryResult = safeParse(
        Admin.GetPrintedBallotsQueryParamsSchema,
        { ballotMode: query.get('ballotMode') ?? undefined }
      );

      if (parseQueryResult.isErr()) {
        return { status: 400 };
      }

      return {
        body: typedAs<Admin.GetPrintedBallotsResponse>({
          status: 'ok',
          printedBallots: await dbEntry.memoryBackend.loadPrintedBallots(
            parseQueryResult.ok()
          ),
        }),
      };
    })
    .post('glob:/admin/elections/*/printed-ballots', async (url, request) => {
      const match = url.match(/^\/admin\/elections\/(.+)\/printed-ballots$/);
      const electionId = match?.[1] as Id;
      const dbEntry = db.get(electionId);

      if (!dbEntry) {
        return { status: 404 };
      }

      const body = safeParseJson(
        request.body as string,
        Admin.PostPrintedBallotRequestSchema
      ).unsafeUnwrap();
      const id = await dbEntry.memoryBackend.addPrintedBallot(body);

      return {
        body: typedAs<Admin.PostPrintedBallotResponse>({ status: 'ok', id }),
      };
    });

  return new ElectionManagerStoreAdminBackend({
    storage,
    logger,
  });
}

describe.each([
  ['memory', makeMemoryBackend],
  ['admin', makeAdminBackend],
])('%s backend', (_backendName, makeBackend) => {
  test('configure', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    expect(await backend.loadCurrentElectionMetadata()).toStrictEqual(
      expect.objectContaining(
        typedAs<Partial<Admin.ElectionRecord>>({
          electionDefinition:
            electionFamousNames2021Fixtures.electionDefinition,
          createdAt: expect.any(String),
        })
      )
    );
  });

  test('add printed ballot', async () => {
    const backend = makeBackend();

    await expect(backend.loadPrintedBallots()).rejects.toThrowError(
      'Election definition must be configured first'
    );

    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    const printedBallot: Admin.PrintedBallot = {
      ballotType: 'standard',
      ballotMode: Admin.BallotMode.Sample,
      ballotStyleId: '1',
      precinctId: '1',
      locales: { primary: 'en_US' },
      numCopies: 1,
    };

    expect(await backend.loadPrintedBallots()).toEqual([]);
    await backend.addPrintedBallot(printedBallot);
    expect(await backend.loadPrintedBallots()).toStrictEqual([
      {
        id: expect.any(String),
        electionId: expect.any(String),
        ...printedBallot,
        createdAt: expect.any(String),
      },
    ]);
    expect(
      await backend.loadPrintedBallots({ ballotMode: Admin.BallotMode.Draft })
    ).toStrictEqual([]);
  });

  test('reset', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    await backend.markResultsOfficial();
    await backend.reset();
    expect(await backend.loadCurrentElectionMetadata()).toBeUndefined();
  });

  test('marking results as official', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionFamousNames2021Fixtures.electionDefinition.electionData
    );
    await backend.markResultsOfficial();
  });

  test('cast vote record files', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
    );
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
    await backend.addCastVoteRecordFile(
      new File(
        [electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer()],
        'standard.jsonl'
      )
    );
    expect((await backend.loadCastVoteRecordFiles())?.fileList).toHaveLength(1);
    expect(await backend.loadWriteIns()).toHaveLength(1187);
    expect(
      await backend.loadWriteIns({ contestId: 'zoo-council-mammal' })
    ).toHaveLength(649);
    await backend.clearCastVoteRecordFiles();
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
  });

  test('full election tallies', async () => {
    const backend = makeBackend();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());
    const manualTally = convertTalliesByPrecinctToFullExternalTally(
      { '6522': { contestTallies: {}, numberOfBallotsCounted: 100 } },
      electionWithMsEitherNeitherFixtures.election,
      VotingMethod.Absentee,
      ExternalTallySourceType.Manual,
      'Manually Added Data',
      new Date()
    );

    await backend.updateFullElectionExternalTally(
      ExternalTallySourceType.Manual,
      manualTally
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([manualTally]);

    await backend.removeFullElectionExternalTally(
      ExternalTallySourceType.Manual
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([]);

    await backend.updateFullElectionExternalTally(
      ExternalTallySourceType.Manual,
      manualTally
    );
    expect(
      Array.from((await backend.loadFullElectionExternalTallies())!.values())
    ).toStrictEqual([manualTally]);

    await backend.clearFullElectionExternalTallies();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());

    await backend.reset();
    expect(
      (await backend.loadFullElectionExternalTallies()) ?? new Map()
    ).toEqual(new Map());
  });

  test('write-in transcription & adjudication', async () => {
    const backend = makeBackend();
    await backend.configure(
      electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
    );
    expect(await backend.loadCastVoteRecordFiles()).toBeUndefined();
    await backend.addCastVoteRecordFile(
      new File(
        [electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer()],
        'standard.jsonl'
      )
    );
    const [pendingWriteIn] = (await backend.loadWriteIns({
      status: 'pending',
    })) as Admin.WriteInRecordPendingTranscription[];
    await backend.transcribeWriteIn(pendingWriteIn.id, 'Mickey Mouse');

    const [transcribedWriteIn] = (await backend.loadWriteIns({
      status: 'transcribed',
    })) as Admin.WriteInRecordTranscribed[];

    expect(transcribedWriteIn).toEqual(
      typedAs<Admin.WriteInRecord>({
        ...pendingWriteIn,
        status: 'transcribed',
        transcribedValue: 'Mickey Mouse',
      })
    );

    const writeInAdjudicationId = await backend.adjudicateWriteInTranscription(
      transcribedWriteIn.contestId,
      'Mickey Mouse',
      'Richard Mouse'
    );

    expect(await backend.loadWriteInAdjudications()).toEqual(
      typedAs<Admin.GetWriteInAdjudicationsResponse>([
        {
          id: expect.any(String),
          contestId: transcribedWriteIn.contestId,
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Richard Mouse',
        },
      ])
    );

    expect(
      await backend.loadWriteInAdjudications({ contestId: 'not-a-contest-id' })
    ).toEqual(typedAs<Admin.GetWriteInAdjudicationsResponse>([]));

    const [adjudicatedWriteIn] = (await backend.loadWriteIns({
      status: 'adjudicated',
    })) as Admin.WriteInRecordAdjudicated[];

    expect(adjudicatedWriteIn).toEqual(
      typedAs<Admin.WriteInRecord>({
        ...transcribedWriteIn,
        status: 'adjudicated',
        adjudicatedValue: 'Richard Mouse',
      })
    );

    await backend.updateWriteInAdjudication(
      writeInAdjudicationId,
      'Bob Barker'
    );

    const [updatedWriteIn] = (await backend.loadWriteIns({
      status: 'adjudicated',
    })) as Admin.WriteInRecordAdjudicated[];

    expect(updatedWriteIn).toEqual(
      typedAs<Admin.WriteInRecord>({
        ...adjudicatedWriteIn,
        adjudicatedValue: 'Bob Barker',
      })
    );

    await backend.deleteWriteInAdjudication(writeInAdjudicationId);

    const [backToTranscribedWriteIn] = (await backend.loadWriteIns({
      status: 'transcribed',
    })) as Admin.WriteInRecordTranscribed[];

    expect(backToTranscribedWriteIn).toEqual(
      typedAs<Admin.WriteInRecord>({
        ...updatedWriteIn,
        status: 'transcribed',
        adjudicatedValue: undefined,
      })
    );
  });
});
