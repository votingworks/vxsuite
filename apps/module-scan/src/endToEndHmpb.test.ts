import { EventEmitter } from 'events'
import { Application } from 'express'
import * as fs from 'fs-extra'
import { join } from 'path'
import request from 'supertest'
import election from '../test/fixtures/state-of-hamilton/election'
import getScannerCVRCountWaiter from '../test/getScannerCVRCountWaiter'
import SystemImporter, { Importer } from './importer'
import { FujitsuScanner, Scanner } from './scanner'
import { buildApp } from './server'
import Store from './store'
import { BallotPackageManifest, CastVoteRecord } from './types'
import { MarkStatus } from './types/ballot-review'
import makeTemporaryBallotImportImageDirectories, {
  TemporaryBallotImportImageDirectories,
} from './util/makeTemporaryBallotImportImageDirectories'

const electionFixturesRoot = join(
  __dirname,
  '..',
  'test/fixtures/state-of-hamilton'
)

jest.mock('./exec', () => ({
  __esModule: true,
  default: async (): Promise<{ stdout: string; stderr: string }> => ({
    stdout: '',
    stderr: '',
  }),
  streamExecFile: (): unknown => {
    const child = new EventEmitter()

    Object.defineProperties(child, {
      stdout: { value: new EventEmitter() },
      stderr: { value: new EventEmitter() },
    })

    process.nextTick(() => child.emit('exit', 0))

    return child
  },
}))

let importDirs: TemporaryBallotImportImageDirectories
let store: Store
let scanner: Scanner
let importer: Importer
let app: Application

beforeEach(async () => {
  importDirs = makeTemporaryBallotImportImageDirectories()
  store = await Store.memoryStore()
  scanner = new FujitsuScanner()
  importer = new SystemImporter({ store, scanner, ...importDirs.paths })
  app = buildApp({ importer, store })
})

afterEach(async () => {
  await importer.unconfigure()
  importDirs.remove()
})

test('going through the whole process works', async () => {
  jest.setTimeout(20000)

  const waiter = getScannerCVRCountWaiter(importer as SystemImporter)

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

  const expectedSampleBallots = 2

  {
    // move some sample ballots into the ballots directory
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p1.jpg'),
      join(importDirs.paths.ballotImagesPath, 'batch-1-ballot-1.jpg')
    )
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p2.jpg'),
      join(importDirs.paths.ballotImagesPath, 'batch-1-ballot-2.jpg')
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
    expect(JSON.parse(status.text).batches[0].count).toBe(expectedSampleBallots)
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

    const p1CVR = CVRs.find(
      (cvr) => Array.isArray(cvr['president']) && cvr['president'].length > 0
    )!
    const p2CVR = CVRs.find((cvr) => cvr !== p1CVR)!

    delete p1CVR._ballotId
    delete p2CVR._ballotId

    expect(p1CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 1,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "president": Array [
          "barchi-hallaren",
        ],
        "representative-district-6": Array [
          "schott",
        ],
        "senator": Array [
          "brown",
        ],
      }
    `)
    expect(p2CVR).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 2,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "governor": Array [
          "windbeck",
        ],
        "lieutenant-governor": Array [
          "davis",
        ],
        "secretary-of-state": Array [
          "talarico",
        ],
        "state-assembly-district-54": Array [
          "keller",
        ],
        "state-senator-district-31": Array [],
      }
    `)
  }

  await importer.waitForImports()
})

test('failed scan with QR code can be adjudicated and exported', async () => {
  jest.setTimeout(20000)

  const waiter = getScannerCVRCountWaiter(importer as SystemImporter)

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

  const expectedSampleBallots = 1

  {
    // move some sample ballots into the ballots directory
    await fs.copyFile(
      join(electionFixturesRoot, 'filled-in-dual-language-p3.jpg'),
      join(importDirs.paths.ballotImagesPath, 'batch-1-ballot-1.jpg')
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
    expect(JSON.parse(status.text).batches[0].count).toBe(expectedSampleBallots)
  }

  await request(app)
    .patch('/scan/hmpb/ballot/1')
    .send({ 'city-mayor': { seldon: MarkStatus.Marked } })
    .expect(200)

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

    delete CVRs[0]._ballotId
    expect(CVRs[0]).toMatchInlineSnapshot(`
      Object {
        "_ballotStyleId": "12",
        "_locales": Object {
          "primary": "en-US",
          "secondary": "es-US",
        },
        "_pageNumber": 3,
        "_precinctId": "23",
        "_scannerId": "000",
        "_testBallot": false,
        "city-mayor": Array [
          "seldon",
        ],
      }
    `)
  }

  await importer.waitForImports()
})
