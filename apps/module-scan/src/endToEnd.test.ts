import { electionSample as election } from '@votingworks/ballot-encoder'
import { Application } from 'express'
import * as path from 'path'
import request from 'supertest'
import { fileSync } from 'tmp'
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
  store = await Store.fileStore(fileSync().name)
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
    .send({ election, testMode: true })
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
      expect.objectContaining({ president: ['boone-lian'] }),
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
  await request(app).patch('/config').send({ election: null })
})
