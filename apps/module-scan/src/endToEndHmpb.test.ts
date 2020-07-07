import * as fs from 'fs-extra'
import { join } from 'path'
import request from 'supertest'
import election from '../test/fixtures/state-of-hamilton/election'
import getScannerCVRCountWaiter from '../test/getScannerCVRCountWaiter'
import SystemImporter from './importer'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'
import { FujitsuScanner } from './scanner'
import { buildApp } from './server'
import Store from './store'
import { CastVoteRecord, BallotPackageManifest } from './types'

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
)

jest.mock('./exec')

let importDirs: TemporaryBallotImportImageDirectories

beforeEach(() => {
  importDirs = makeTemporaryBallotImportImageDirectories()
})

afterEach(() => {
  importDirs.remove()
})

test('going through the whole process works', async () => {
  jest.setTimeout(20000)

  const store = await Store.memoryStore()
  const scanner = new FujitsuScanner()
  const importer = new SystemImporter({ store, scanner, ...importDirs.paths })
  const app = buildApp({ importer, store })
  const waiter = getScannerCVRCountWaiter(importer)

  await importer.restoreConfig()

  await request(app)
    .patch('/config')
    .send({ election })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })

  const manifest: BallotPackageManifest = JSON.parse(
    await fs.readFile(join(electionFixturesRoot, 'manifest.json'), 'utf8')
  )

  const addTemplatesRequest = request(app).post('/scan/hmpb/addTemplates')

  for (const config of manifest.ballots) {
    addTemplatesRequest
      .attach('ballots', join(electionFixturesRoot, config.filename))
      .attach(
        'metadatas',
        Buffer.from(new TextEncoder().encode(JSON.stringify(config))),
        { filename: 'config.json', contentType: 'application/json' }
      )
  }

  await addTemplatesRequest.expect(200, { status: 'ok' })
  await request(app).post('/scan/scanBatch').expect(200, { status: 'ok' })

  {
    // move some sample ballots into the ballots directory
    const expectedSampleBallots = 2
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p1.jpg'),
      join(importer.ballotImagesPath, 'batch-1-ballot-1.jpg')
    )
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p2.jpg'),
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
      (cvr) => Array.isArray(cvr['president']) && cvr['president'].length > 0
    )!
    const p2CVR = CVRs.find((cvr) => cvr !== p1CVR)!

    delete p1CVR._ballotId
    delete p2CVR._ballotId

    expect(p1CVR).toMatchInlineSnapshot(`
      Object {
        "102": Array [],
        "_ballotStyleId": "12",
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "city-council": Array [],
        "city-mayor": Array [],
        "county-commissioners": Array [],
        "county-registrar-of-wills": Array [],
        "governor": Array [],
        "judicial-elmer-hull": Array [],
        "judicial-robert-demergue": Array [],
        "lieutenant-governor": Array [],
        "measure-101": Array [],
        "president": Array [
          "barchi-hallaren",
        ],
        "proposition-1": Array [],
        "question-a": Array [],
        "question-b": Array [],
        "question-c": Array [],
        "representative-district-6": Array [
          "schott",
        ],
        "secretary-of-state": Array [],
        "senator": Array [
          "brown",
        ],
        "state-assembly-district-54": Array [],
        "state-senator-district-31": Array [],
      }
    `)
    expect(p2CVR).toMatchInlineSnapshot(`
      Object {
        "102": Array [],
        "_ballotStyleId": "12",
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "city-council": Array [],
        "city-mayor": Array [],
        "county-commissioners": Array [],
        "county-registrar-of-wills": Array [],
        "governor": Array [
          "windbeck",
        ],
        "judicial-elmer-hull": Array [],
        "judicial-robert-demergue": Array [],
        "lieutenant-governor": Array [
          "davis",
        ],
        "measure-101": Array [],
        "president": Array [],
        "proposition-1": Array [],
        "question-a": Array [],
        "question-b": Array [],
        "question-c": Array [],
        "representative-district-6": Array [],
        "secretary-of-state": Array [
          "talarico",
        ],
        "senator": Array [],
        "state-assembly-district-54": Array [
          "keller",
        ],
        "state-senator-district-31": Array [],
      }
    `)
  }
})
