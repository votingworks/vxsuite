import { electionSample as election } from '@votingworks/ballot-encoder'
import { Application } from 'express'
import * as path from 'path'
import request from 'supertest'
import { makeMockScanner, MockScanner } from '../test/util/mocks'
import SystemImporter from './importer'
import { buildApp } from './server'
import Store from './store'
import { CastVoteRecord } from './types'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'

const sampleBallotImagesPath = path.join(
  __dirname,
  '..',
  'sample-ballot-images/'
)

// we need more time for ballot interpretation
jest.setTimeout(20000)

let app: Application
let importer: SystemImporter
let store: Store
let scanner: MockScanner
let importDirs: TemporaryBallotImportImageDirectories

beforeEach(async () => {
  store = await Store.memoryStore()
  scanner = makeMockScanner()
  importDirs = makeTemporaryBallotImportImageDirectories()
  importer = new SystemImporter({
    store,
    scanner,
    ...importDirs.paths,
  })
  app = buildApp({ importer, store })
})

afterEach(async () => {
  importDirs.remove()
})

test('going through the whole process works', async () => {
  {
    // try export before configure
    const response = await request(app)
      .post('/scan/export')
      .set('Accept', 'application/json')
      .expect(200)
    expect(response.text).toBe('')
  }

  await request(app)
    .patch('/config')
    .send({ election })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  {
    // define the next scanner session & scan some sample ballots
    scanner
      .withNextScannerSession()
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-1.jpg'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-2.jpg'),
        path.join(sampleBallotImagesPath, 'blank-page.png'),
      ])
      .sheet([
        path.join(sampleBallotImagesPath, 'sample-batch-1-ballot-3.jpg'),
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

    // response is a few lines, each JSON.
    // can't predict the order so can't compare
    // to expected outcome as a string directly.
    const CVRs: CastVoteRecord[] = exportResponse.text
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    const ballotIds = CVRs.map((cvr) => cvr._ballotId)
    ballotIds.sort()
    expect(ballotIds).toEqual([
      '85lnPkvfNEytP3Z8gMoEcA',
      'SAlVfdOQd4G6ALjkH3rlOg', // v1 encoding
      'r6UYR4t7hEFMz8QlMWf1Sw',
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
  await request(app).patch('/config').send({ election: null })
})
