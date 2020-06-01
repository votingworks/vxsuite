import * as fs from 'fs-extra'
import { join } from 'path'
import request from 'supertest'
import election from '../test/fixtures/hmpb-dallas-county/election'
import getScannerCVRCountWaiter from '../test/getScannerCVRCountWaiter'
import SystemImporter from './importer'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './makeTemporaryBallotImportImageDirectories'
import { FujitsuScanner } from './scanner'
import { buildApp } from './server'
import Store from './store'
import { CastVoteRecord } from './types'

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/hmpb-dallas-county'
)

jest.mock('./exec')

let importDirs: TemporaryBallotImportImageDirectories

beforeEach(() => {
  importDirs = makeTemporaryBallotImportImageDirectories()
})

afterEach(() => {
  // importDirs.remove()
})

test('going through the whole process works', async () => {
  jest.setTimeout(10000)

  const store = await Store.memoryStore()
  const scanner = new FujitsuScanner()
  const importer = new SystemImporter({ store, scanner, ...importDirs.paths })
  const app = buildApp({ importer, store })
  const waiter = getScannerCVRCountWaiter(importer)

  await request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', join(electionFixturesRoot, 'ballot.pdf'))
    .expect(200)

  await request(app).post('/scan/scanBatch').expect(200, { status: 'ok' })

  {
    // move some sample ballots into the ballots directory
    const expectedSampleBallots = 2
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-p1.jpg'),
      join(importer.ballotImagesPath, 'batch-1-ballot-1.jpg')
    )
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-p2.jpg'),
      join(importer.ballotImagesPath, 'batch-1-ballot-2.jpg')
    )

    // wait for the processing
    await waiter.waitForCount(expectedSampleBallots)
  }

  {
    // check the latest batch has the expected ballots
    const status = await request(app)
      .get('/scan/status')
      .set('Accept', 'application/json')
      .expect(200)
    expect(JSON.parse(status.text).batches.length).toBe(1)
    expect(JSON.parse(status.text).batches[0].count).toBe(2)
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
      .map((line) => JSON.parse(line))
    const p1CVR = CVRs.find(
      (cvr) => Array.isArray(cvr['us-senate']) && cvr['us-senate'].length > 0
    )!
    const p2CVR = CVRs.find((cvr) => cvr !== p1CVR)!

    delete p1CVR._ballotId
    delete p2CVR._ballotId

    expect(p1CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "77",
        "_precinctId": "42",
        "_testBallot": false,
        "dallas-city-council": Array [],
        "dallas-county-commissioners-court-pct-3": Array [],
        "dallas-county-proposition-r": Array [],
        "dallas-county-retain-chief-justice": Array [],
        "dallas-county-sheriff": Array [
          "chad-prda",
        ],
        "dallas-county-tax-assessor": Array [
          "john-ames",
        ],
        "dallas-mayor": Array [],
        "texas-house-district-111": Array [
          "writein",
        ],
        "texas-sc-judge-place-6": Array [
          "jane-bland",
        ],
        "us-house-district-30": Array [
          "eddie-bernice-johnson",
        ],
        "us-senate": Array [
          "tim-smith",
        ],
      }
    `)
    expect(p2CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "77",
        "_precinctId": "42",
        "_testBallot": false,
        "dallas-city-council": Array [],
        "dallas-county-commissioners-court-pct-3": Array [
          "andrew-jewell",
        ],
        "dallas-county-proposition-r": Array [
          "no",
        ],
        "dallas-county-retain-chief-justice": Array [],
        "dallas-county-sheriff": Array [],
        "dallas-county-tax-assessor": Array [],
        "dallas-mayor": Array [],
        "texas-house-district-111": Array [],
        "texas-sc-judge-place-6": Array [],
        "us-house-district-30": Array [],
        "us-senate": Array [],
      }
    `)
  }
})
