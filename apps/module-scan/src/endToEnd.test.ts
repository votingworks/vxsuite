import { electionSample as election } from '@votingworks/fixtures'
import { Application } from 'express'
import * as path from 'path'
import request from 'supertest'
import * as fsExtra from 'fs-extra'
import { dirSync } from 'tmp'
import { makeMockScanner, MockScanner } from '../test/util/mocks'
import SystemImporter from './importer'
import { buildApp } from './server'
import { CastVoteRecord } from './types'
import { createWorkspace, Workspace } from './util/workspace'
import { fromElection } from './util/electionDefinition'

const sampleBallotImagesPath = path.join(
  __dirname,
  '..',
  'sample-ballot-images/'
)

// we need more time for ballot interpretation
jest.setTimeout(20000)

let app: Application
let importer: SystemImporter
let workspace: Workspace
let scanner: MockScanner

beforeEach(async () => {
  scanner = makeMockScanner()
  workspace = await createWorkspace(dirSync().name)
  importer = new SystemImporter({
    workspace,
    scanner,
  })
  app = buildApp({ importer, store: workspace.store })
})

afterEach(async () => {
  await fsExtra.remove(workspace.path)
})

test('going through the whole process works', async () => {
  // Do this first so interpreter workers get initialized with the right value.
  await request(app)
    .patch('/config/skipElectionHashCheck')
    .send({ skipElectionHashCheck: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  {
    // try export before configure
    const response = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)
    expect(response.text).toBe('')
  }

  await request(app)
    .patch('/config/electionDefinition')
    .send(fromElection(election))
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  await request(app)
    .patch('/config/testMode')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  {
    // define the next scanner session & scan some sample ballots
    scanner
      .withNextScannerSession()
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.png'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .end()
    await request(app)
      .post('/scan/scanBatch')
      .expect(200)
      .then((response) => {
        expect(response.body).toEqual({
          status: 'ok',
          batchId: expect.any(String),
        })
      })

    await importer.waitForEndOfBatchOrScanningPause()

    // check the status
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)

    expect(JSON.parse(status.text).batches[0].count).toBe(3)
  }

  {
    const exportResponse = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)

    const CVRs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(CVRs).toEqual([
      // sample-batch-1-ballot-1.png
      expect.objectContaining({ president: ['cramer-vuocolo'] }),
      // sample-batch-1-ballot-2.png
      expect.objectContaining({
        president: ['boone-lian'],
        'county-commissioners': ['argent', 'bainbridge', 'write-in__BOB SMITH'],
      }),
      // sample-batch-1-ballot-3.png
      expect.objectContaining({ president: ['barchi-hallaren'] }),
    ])
  }

  {
    // delete all batches
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    for (const { id } of JSON.parse(status.text).batches) {
      await request(app)
        .delete(`/scan/batch/${id}`)
        .set('Accept', 'application/json')
        .expect(200)

      // can't delete it again
      await request(app)
        .delete(`/scan/batch/${id}`)
        .set('Accept', 'application/json')
        .expect(404)
    }
  }

  {
    // expect that we have no batches
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(JSON.parse(status.text).batches).toEqual([])
  }

  // no CVRs!
  await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')

  // clean up
  await request(app).delete('/config/electionDefinition')
})
