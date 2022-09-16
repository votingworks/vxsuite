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
  const getWriteInSummaryHttpResponse = await request(app)
    .get(
      `/admin/elections/${electionId}/write-in-summary?contestId=${contestId}`
    )
    .expect(200);
  const getWriteInSummaryResponse = unsafeParse(
    Admin.GetWriteInSummaryResponseSchema,
    getWriteInSummaryHttpResponse.body
  );
  expect(getWriteInSummaryResponse).toEqual(
    typedAs<Admin.WriteInSummaryEntry[]>([
      {
        contestId,
        writeInCount: expect.any(Number),
      },
    ])
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
        contestId,
        transcribedValue: 'Mickey Mouse',
        writeInCount,
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
        contestId,
        transcribedValue: 'Mickey Mouse',
        writeInCount,
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
    getWriteInSummaryAfterAdjudicationResponse as Admin.WriteInSummaryEntry[]
  )[0]?.writeInAdjudication!.id;

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
        contestId,
        transcribedValue: 'Mickey Mouse',
        writeInCount,
        writeInAdjudication: {
          id: expect.any(String),
          contestId,
          transcribedValue: 'Mickey Mouse',
          adjudicatedValue: 'Modest Mouse',
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
        contestId,
        transcribedValue: 'Mickey Mouse',
        writeInCount,
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
