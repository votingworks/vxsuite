import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { unsafeParse } from '@votingworks/types';
import { assert, typedAs } from '@votingworks/utils';
import { Application } from 'express';
import request from 'supertest';
import { dirSync } from 'tmp';
import { buildApp } from './server';
import { createWorkspace, Workspace } from './util/workspace';

let app: Application;
let workspace: Workspace;

beforeEach(() => {
  jest.restoreAllMocks();
  workspace = createWorkspace(dirSync().name);
  app = buildApp({ store: workspace.store });
});

test('write-in adjudication lifecycle', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  // upload the CVR file
  const postCvrHttpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const postCvrResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    postCvrHttpResponse.body
  );

  assert(postCvrResponse.status === 'ok');

  // focus on this contest
  const contestId = 'zoo-council-mammal';

  // view the adjudication table
  const getWriteInAdjudicationTableHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/contests/${contestId}/write-in-adjudication-table`
    )
    .expect(200);
  const getWriteInAdjudicationTableResponse = unsafeParse(
    Admin.GetWriteInAdjudicationTableResponseSchema,
    getWriteInAdjudicationTableHttpResponse.body
  );
  expect(getWriteInAdjudicationTableResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationTableResponse>({
      status: 'ok',
      table: {
        contestId,
        writeInCount: 0,
        adjudicated: [],
        transcribed: {
          writeInCount: 0,
          rows: [],
        },
      },
    })
  );

  // process all the write-ins for the contest we're going to adjudicate
  let writeInCount = 0;
  for (;;) {
    const getWriteInsHttpResponse = await request(app)
      .get(
        `/admin/elections/${electionId}/write-ins?status=pending&contestId=${contestId}&limit=1`
      )
      .expect(200);
    const getWriteInsResponse = unsafeParse(
      Admin.GetWriteInsResponseSchema,
      getWriteInsHttpResponse.body
    );
    assert(Array.isArray(getWriteInsResponse));

    if (getWriteInsResponse.length === 0) {
      break;
    }

    const writeInRecord = getWriteInsResponse[0]!;

    // get the ballot image data for the write in
    const getImageHttpResponse = await request(app)
      .get(`/admin/write-in-image/${writeInRecord.id}`)
      .expect(200);
    const getImageResponse = unsafeParse(
      Admin.GetWriteInImageResponseSchema,
      getImageHttpResponse.body
    );
    assert(Array.isArray(getImageResponse));
    expect(getImageResponse).toHaveLength(0); // the fixtures do not have ballot images

    // transcribe it
    await request(app)
      .put(`/admin/write-ins/${writeInRecord.id}/transcription`)
      .send(
        typedAs<Admin.PutWriteInTranscriptionRequest>({
          value: 'Mickey Mouse',
        })
      )
      .expect(200);

    writeInCount += 1;
  }

  // view the adjudication table
  const getWriteInSummaryAfterTranscriptionHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryAfterTranscriptionResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAfterTranscriptionHttpResponse.body
  );

  expect(getWriteInSummaryAfterTranscriptionResponse).toEqual(
    typedAs<Admin.GetWriteInSummaryResponse>([
      {
        status: 'transcribed',
        contestId,
        writeInCount,
        transcribedValue: 'Mickey Mouse',
      },
    ])
  );

  const getWriteInAdjudicationsAfterTranscriptionHttpResponse = await request(
    app
  )
    .get(
      `/admin/elections/${electionId}/write-in-adjudications?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInAdjudicationsAfterTranscriptionResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsAfterTranscriptionHttpResponse.body
  );

  expect(getWriteInAdjudicationsAfterTranscriptionResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([])
  );

  // adjudicate all "Mickey Mouse" transcribed write-ins as "Mickey Mouse"
  await request(app)
    .post(`/admin/elections/${electionId}/write-in-adjudications`)
    .send(
      typedAs<Admin.PostWriteInAdjudicationRequest>({
        contestId,
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Mickey Mouse',
      })
    )
    .expect(200);

  // view the adjudication table
  const getWriteInSummaryAfterAdjudicationHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryAfterAdjudicationResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAfterAdjudicationHttpResponse.body
  );
  expect(getWriteInSummaryAfterAdjudicationResponse).toEqual(
    typedAs<Admin.GetWriteInSummaryResponse>([
      {
        status: 'adjudicated',
        contestId,
        writeInCount,
        transcribedValue: 'Mickey Mouse',
        writeInAdjudication: {
          id: expect.any(String),
          contestId,
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Mickey Mouse',
        },
      },
    ])
  );

  const getWriteInAdjudicationsAfterAdjudicationHttpResponse = await request(
    app
  )
    .get(
      `/admin/elections/${electionId}/write-in-adjudications?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInAdjudicationsAfterAdjudicationResponse = unsafeParse(
    Admin.GetWriteInAdjudicationsResponseSchema,
    getWriteInAdjudicationsAfterAdjudicationHttpResponse.body
  );

  expect(getWriteInAdjudicationsAfterAdjudicationResponse).toEqual(
    typedAs<Admin.GetWriteInAdjudicationsResponse>([
      {
        id: expect.any(String),
        contestId,
        transcribedValue: 'Mickey Mouse',
        adjudicatedValue: 'Mickey Mouse',
      },
    ])
  );

  const writeInAdjudicationId = (
    getWriteInSummaryAfterAdjudicationResponse as Admin.WriteInSummaryEntryAdjudicated[]
  )[0]?.writeInAdjudication.id;

  // update the adjudication
  await request(app)
    .put(`/admin/write-in-adjudications/${writeInAdjudicationId}`)
    .send(
      typedAs<Admin.PutWriteInAdjudicationRequest>({
        adjudicatedValue: 'Modest Mouse',
      })
    )
    .expect(200);

  // view the adjudication table
  const getWriteInSummaryAfterUpdateHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryAfterUpdateResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAfterUpdateHttpResponse.body
  );
  expect(getWriteInSummaryAfterUpdateResponse).toEqual(
    typedAs<Admin.GetWriteInSummaryResponse>([
      {
        status: 'adjudicated',
        contestId,
        writeInCount,
        transcribedValue: 'Mickey Mouse',
        writeInAdjudication: {
          id: expect.any(String),
          contestId,
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Modest Mouse',
        },
      },
    ])
  );

  // update the adjudication again to an official candidate
  await request(app)
    .put(`/admin/write-in-adjudications/${writeInAdjudicationId}`)
    .send(
      typedAs<Admin.PutWriteInAdjudicationRequest>({
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      })
    )
    .expect(200);

  // view the adjudication table
  const getWriteInSummaryAfterUpdateAgainHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryAfterUpdateAgainResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAfterUpdateAgainHttpResponse.body
  );
  expect(getWriteInSummaryAfterUpdateAgainResponse).toEqual(
    typedAs<Admin.GetWriteInSummaryResponse>([
      {
        status: 'adjudicated',
        contestId,
        writeInCount,
        transcribedValue: 'Mickey Mouse',
        writeInAdjudication: {
          id: expect.any(String),
          contestId,
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Zebra',
          adjudicatedOptionId: 'zebra',
        },
      },
    ])
  );

  // delete the adjudication
  await request(app)
    .delete(`/admin/write-in-adjudications/${writeInAdjudicationId}`)
    .expect(200);

  // view the adjudication table
  const getWriteInSummaryAfterDeleteHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryAfterDeleteResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAfterDeleteHttpResponse.body
  );
  expect(getWriteInSummaryAfterDeleteResponse).toEqual(
    typedAs<Admin.GetWriteInSummaryResponse>([
      {
        status: 'transcribed',
        contestId,
        writeInCount,
        transcribedValue: 'Mickey Mouse',
      },
    ])
  );
});

test('write-in summary filtered by contestId & status', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  // upload the CVR file
  const postCvrHttpResponse = await request(app)
    .post(`/admin/elections/${electionId}/cvr-files`)
    .attach(
      'cvrFile',
      electionMinimalExhaustiveSampleFixtures.standardCvrFile.asBuffer(),
      'cvrFile.json'
    )
    .expect(200);
  const postCvrResponse = unsafeParse(
    Admin.PostCvrFileResponseSchema,
    postCvrHttpResponse.body
  );

  assert(postCvrResponse.status === 'ok');

  // focus on this contest
  const contestId = 'zoo-council-mammal';

  const getWriteInSummaryPendingHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}&status=pending`
    )
    .expect(200);
  const getWriteInSummaryPendingResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryPendingHttpResponse.body
  );
  expect(getWriteInSummaryPendingResponse).toHaveLength(1);

  const getWriteInSummaryTranscribedHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}&status=transcribed`
    )
    .expect(200);
  const getWriteInSummaryTranscribedResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryTranscribedHttpResponse.body
  );
  expect(getWriteInSummaryTranscribedResponse).toHaveLength(0);

  const getWriteInSummaryAdjudicatedHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}&status=adjudicated`
    )
    .expect(200);
  const getWriteInSummaryAdjudicatedResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryAdjudicatedHttpResponse.body
  );
  expect(getWriteInSummaryAdjudicatedResponse).toHaveLength(0);
});

test('write-in adjudication table with a bad electionId', async () => {
  await request(app)
    .get(
      `/admin/elections/invalid/contests/contest-1/write-in-adjudication-table`
    )
    .expect(404);
});

test('create write-in adjudication for an unlisted candidate', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .post(`/admin/elections/${electionId}/write-in-adjudications`)
    .send(
      typedAs<Admin.PostWriteInAdjudicationRequest>({
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Cyclops',
      })
    )
    .expect(200);

  expect(workspace.store.getWriteInAdjudicationRecords({ electionId })).toEqual(
    typedAs<Admin.WriteInAdjudicationRecord[]>([
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
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .post(`/admin/elections/${electionId}/write-in-adjudications`)
    .send(
      typedAs<Admin.PostWriteInAdjudicationRequest>({
        contestId: 'zoo-council-mammal',
        transcribedValue: 'Zebra',
        adjudicatedValue: 'Zebra',
        adjudicatedOptionId: 'zebra',
      })
    )
    .expect(200);

  expect(workspace.store.getWriteInAdjudicationRecords({ electionId })).toEqual(
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

test('create write-in adjudication with invalid request', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .post(`/admin/elections/${electionId}/write-in-adjudications`)
    .send({})
    .expect(400);
});

test('update write-in adjudication with invalid request', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  const writeInAdjudicationId = workspace.store.createWriteInAdjudication({
    electionId,
    contestId: 'contest-1',
    transcribedValue: 'Mickey Mouse',
    adjudicatedValue: 'Mickey Mouse',
  });

  await request(app)
    .put(`/admin/write-in-adjudications/${writeInAdjudicationId}`)
    .send({})
    .expect(400);
});

test('GET /admin/elections/:electionId/write-in-summary with bad query', async () => {
  const electionId = workspace.store.addElection(
    electionMinimalExhaustiveSampleFixtures.electionDefinition.electionData
  );

  await request(app)
    .get(`/admin/elections/${electionId}/write-in-summary?bad=query`)
    .expect(400);
});
