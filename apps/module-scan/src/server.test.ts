import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures'
import * as plusteksdk from '@votingworks/plustek-sdk'
import { BallotType, ok } from '@votingworks/types'
import {
  GetScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import { Application } from 'express'
import { promises as fs } from 'fs'
import { Server } from 'http'
import { join } from 'path'
import request from 'supertest'
import { dirSync } from 'tmp'
import { mocked } from 'ts-jest/dist/utils/testing'
import { v4 as uuid } from 'uuid'
import { election } from '../test/fixtures/state-of-hamilton'
import { makeMock } from '../test/util/mocks'
import Importer from './importer'
import { buildApp, start } from './server'
import { createWorkspace, Workspace } from './util/workspace'

jest.mock('./importer')
jest.mock('@votingworks/plustek-sdk')

let app: Application
let workspace: Workspace
let importer: jest.Mocked<Importer>

beforeEach(async () => {
  importer = makeMock(Importer)
  workspace = await createWorkspace(dirSync().name)
  await workspace.store.setElection({
    election,
    electionData: JSON.stringify(election),
    electionHash: '',
  })
  await workspace.store.addHmpbTemplate(
    Buffer.of(),
    {
      locales: { primary: 'en-US' },
      electionHash: '',
      ballotType: BallotType.Standard,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
    },
    [
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '12',
            precinctId: '23',
            isTestMode: false,
            pageNumber: 1,
          },
        },
        contests: [],
      },
      {
        ballotImage: {
          metadata: {
            locales: { primary: 'en-US' },
            electionHash: '',
            ballotType: BallotType.Standard,
            ballotStyleId: '12',
            precinctId: '23',
            isTestMode: false,
            pageNumber: 2,
          },
        },
        contests: [],
      },
    ]
  )
  app = buildApp({ importer, store: workspace.store })
})

test('GET /scan/status', async () => {
  const status: GetScanStatusResponse = {
    batches: [],
    adjudication: { remaining: 0, adjudicated: 0 },
    scanner: ScannerStatus.Unknown,
  }
  importer.getStatus.mockResolvedValue(status)
  await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
  expect(importer.getStatus).toBeCalled()
})

test('GET /config/election (application/octet-stream)', async () => {
  await workspace.store.setElection(testElectionDefinition)
  await workspace.store.setTestMode(true)
  await workspace.store.setMarkThresholdOverrides(undefined)
  const response = await request(app)
    .get('/config/election')
    .accept('application/octet-stream')
    .expect(200)
  expect(new TextDecoder().decode(response.body)).toEqual(
    testElectionDefinition.electionData
  )

  await workspace.store.setElection(undefined)
  await request(app)
    .get('/config/election')
    .accept('application/octet-stream')
    .expect(404)
})

test('GET /config/election (application/json)', async () => {
  await workspace.store.setElection(testElectionDefinition)
  await workspace.store.setTestMode(true)
  await workspace.store.setMarkThresholdOverrides(undefined)
  const response = await request(app)
    .get('/config/election')
    .accept('application/json')
    .expect(200)
  // This mess of a comparison is due to `Store#getElectionDefinition` adding
  // default `markThresholds` if they're not set, so it may not be the same as
  // we originally set.
  expect(response.body).toEqual(
    expect.objectContaining({
      electionHash: testElectionDefinition.electionHash,
      election: expect.objectContaining({
        title: testElectionDefinition.election.title,
      }),
    })
  )

  await workspace.store.setElection(undefined)
  await request(app)
    .get('/config/election')
    .accept('application/json')
    .expect(200, 'null')
})

test('GET /config/testMode', async () => {
  await workspace.store.setElection(testElectionDefinition)
  await workspace.store.setTestMode(true)
  await workspace.store.setMarkThresholdOverrides(undefined)
  const response = await request(app).get('/config/testMode').expect(200)
  expect(response.body).toEqual({
    status: 'ok',
    testMode: true,
  })
})

test('GET /config/markThresholdOverrrides', async () => {
  await workspace.store.setElection(testElectionDefinition)
  await workspace.store.setTestMode(true)
  await workspace.store.setMarkThresholdOverrides({
    definite: 0.5,
    marginal: 0.4,
  })
  const response = await request(app)
    .get('/config/markThresholdOverrides')
    .expect(200)

  expect(response.body).toEqual({
    status: 'ok',
    markThresholdOverrides: { definite: 0.5, marginal: 0.4 },
  })
})

test('PATCH /config/election', async () => {
  await request(app)
    .patch('/config/election')
    .send(testElectionDefinition.electionData)
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.configure).toBeCalledWith(
    expect.objectContaining({
      election: expect.objectContaining({
        title: testElectionDefinition.election.title,
      }),
    })
  )

  // bad content type
  await request(app)
    .patch('/config/election')
    .send('gibberish')
    .set('Content-Type', 'text/plain')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'invalid-value',
          message:
            'expected content type to be application/octet-stream, got text/plain',
        },
      ],
    })

  // bad JSON
  await request(app)
    .patch('/config/election')
    .send('gibberish')
    .set('Content-Type', 'application/octet-stream')
    .set('Accept', 'application/json')
    .expect(400, {
      status: 'error',
      errors: [
        {
          type: 'SyntaxError',
          message: 'Unexpected token g in JSON at position 0',
        },
      ],
    })
})

test('DELETE /config/election', async () => {
  importer.unconfigure.mockResolvedValue()

  await request(app)
    .delete('/config/election')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.unconfigure).toBeCalled()
})

test('PATCH /config/testMode', async () => {
  importer.setTestMode.mockResolvedValueOnce(undefined)

  await request(app)
    .patch('/config/testMode')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200)

  expect(importer.setTestMode).toHaveBeenNthCalledWith(1, true)

  await request(app)
    .patch('/config/testMode')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({ testMode: false })
    .expect(200)

  expect(importer.setTestMode).toHaveBeenNthCalledWith(2, false)
})

test('PATCH /config/markThresholdOverrides', async () => {
  importer.setMarkThresholdOverrides.mockResolvedValue(undefined)

  await request(app)
    .patch('/config/markThresholdOverrides')
    .send({ markThresholdOverrides: { marginal: 0.2, definite: 0.3 } })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200)

  expect(importer.setMarkThresholdOverrides).toHaveBeenNthCalledWith(1, {
    marginal: 0.2,
    definite: 0.3,
  })

  await request(app)
    .delete('/config/markThresholdOverrides')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200)

  expect(importer.setMarkThresholdOverrides).toHaveBeenNthCalledWith(
    2,
    undefined
  )
})

test('POST /scan/scanBatch', async () => {
  importer.startImport.mockResolvedValue('mock-batch-id')
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok', batchId: 'mock-batch-id' })
  expect(importer.startImport).toBeCalled()
})

test('POST /scan/scanContinue', async () => {
  importer.continueImport.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/scanContinue')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.continueImport).toBeCalled()
})

test('POST /scan/scanBatch errors', async () => {
  importer.startImport.mockRejectedValue(new Error('scanner is a teapot'))
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, {
      status: 'error',
      errors: [{ type: 'scan-error', message: 'scanner is a teapot' }],
    })
  expect(importer.startImport).toBeCalled()
})

test('POST /scan/export', async () => {
  importer.doExport.mockResolvedValue('')

  await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
  expect(importer.doExport).toBeCalled()
})

test('POST /scan/zero', async () => {
  importer.doZero.mockResolvedValue()

  await request(app)
    .post('/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.doZero).toBeCalled()
})

test('GET /scan/hmpb/ballot/:ballotId/:side/image', async () => {
  const frontOriginal = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1-flipped.jpg'
  )
  const frontNormalized = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p1.jpg'
  )
  const backOriginal = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p2.jpg'
  )
  const backNormalized = join(
    __dirname,
    '../test/fixtures/state-of-hamilton/filled-in-dual-language-p2.jpg'
  )
  const batchId = await workspace.store.addBatch()
  const sheetId = await workspace.store.addSheet(uuid(), batchId, [
    {
      originalFilename: frontOriginal,
      normalizedFilename: frontNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 1,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          allReasonInfos: [],
        },
      },
    },
    {
      originalFilename: backOriginal,
      normalizedFilename: backNormalized,
      interpretation: {
        type: 'InterpretedHmpbPage',
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '12',
          precinctId: '23',
          isTestMode: false,
          pageNumber: 2,
        },
        votes: {},
        markInfo: {
          ballotSize: { width: 0, height: 0 },
          marks: [],
        },
        adjudicationInfo: {
          requiresAdjudication: false,
          enabledReasons: [],
          allReasonInfos: [],
        },
      },
    },
  ])
  await workspace.store.finishBatch({ batchId })

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image`)
    .expect(301)
    .expect('Location', `/scan/hmpb/ballot/${sheetId}/front/image/normalized`)

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image/normalized`)
    .expect(200, await fs.readFile(frontNormalized))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/front/image/original`)
    .expect(200, await fs.readFile(frontOriginal))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image`)
    .expect(301)
    .expect('Location', `/scan/hmpb/ballot/${sheetId}/back/image/normalized`)

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image/normalized`)
    .expect(200, await fs.readFile(backNormalized))

  await request(app)
    .get(`/scan/hmpb/ballot/${sheetId}/back/image/original`)
    .expect(200, await fs.readFile(backOriginal))
})

test('GET /scan/hmpb/ballot/:sheetId/image 404', async () => {
  await request(app)
    .get(`/scan/hmpb/ballot/111/front/image/normalized`)
    .expect(404)
})

test('GET /', async () => {
  await request(app).get('/').expect(301)
})

test('POST /scan/hmpb/addTemplates bad template', async () => {
  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'README.txt',
      contentType: 'text/plain',
    })
    .expect(400)
  expect(JSON.parse(response.text)).toEqual({
    status: 'error',
    errors: [
      {
        type: 'invalid-ballot-type',
        message:
          'expected ballot files to be application/pdf, but got text/plain',
      },
    ],
  })
})

test('POST /scan/hmpb/addTemplates bad metadata', async () => {
  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .expect(400)
  expect(JSON.parse(response.text)).toEqual({
    status: 'error',
    errors: [
      {
        type: 'invalid-metadata-type',
        message:
          'expected ballot metadata to be application/json, but got undefined',
      },
    ],
  })
})

test('POST /scan/hmpb/addTemplates', async () => {
  importer.addHmpbTemplates.mockResolvedValueOnce([
    {
      ballotImage: {
        imageData: {
          data: Uint8ClampedArray.of(0, 0, 0, 0),
          width: 1,
          height: 1,
        },
        metadata: {
          locales: { primary: 'en-US' },
          electionHash: '',
          ballotType: BallotType.Standard,
          ballotStyleId: '77',
          precinctId: '42',
          isTestMode: false,
          pageNumber: 1,
        },
      },
      contests: [],
    },
  ])

  const response = await request(app)
    .post('/scan/hmpb/addTemplates')
    .attach('ballots', Buffer.of(4, 5, 6), {
      filename: 'ballot.pdf',
      contentType: 'application/pdf',
    })
    .attach(
      'metadatas',
      Buffer.from(
        new TextEncoder().encode(
          JSON.stringify({
            ballotStyleId: '77',
            precinctId: '42',
            isTestMode: false,
          })
        )
      ),
      { filename: 'metadata.json', contentType: 'application/json' }
    )
    .expect(200)

  expect(JSON.parse(response.text)).toEqual({ status: 'ok' })
})

test('start reloads configuration from the store', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.()
    return (undefined as unknown) as Server
  })

  // start up the server
  await start({ workspace, importer, app, log: jest.fn() })

  // did we load everything from the store?
  expect(importer.restoreConfig).toHaveBeenCalled()
})

test('start as precinct-scanner rejects a held sheet at startup', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementation()
  const {
    MockScannerClient,
    PaperStatus,
  }: typeof plusteksdk = jest.requireActual('@votingworks/plustek-sdk')

  const mockClient = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  await mockClient.connect()
  ;(await mockClient.simulateLoadSheet(['a.jpg', 'b.jpg'])).unsafeUnwrap()
  ;(await mockClient.scan()).unsafeUnwrap()
  mocked(plusteksdk.createClient).mockResolvedValueOnce(ok(mockClient))

  // start up the server
  await start({
    importer,
    app,
    workspace,
    log: jest.fn(),
    machineType: 'precinct-scanner',
  })

  expect((await mockClient.getPaperStatus()).unsafeUnwrap()).toEqual(
    PaperStatus.VtmReadyToScan
  )
})

test('get next sheet', async () => {
  jest
    .spyOn(workspace.store, 'getNextAdjudicationSheet')
    .mockImplementationOnce(async () => {
      return {
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: { type: 'BlankPage' },
        },
        back: {
          image: { url: '/url/back' },
          interpretation: { type: 'BlankPage' },
        },
      }
    })

  await request(app)
    .get(`/scan/hmpb/review/next-sheet`)
    .expect(200, {
      id: 'mock-review-sheet',
      front: {
        image: { url: '/url/front' },
        interpretation: { type: 'BlankPage' },
      },
      back: {
        image: { url: '/url/back' },
        interpretation: { type: 'BlankPage' },
      },
    })
})

test('calibrate success', async () => {
  importer.doCalibrate.mockResolvedValueOnce(true)

  await request(app).post('/scan/calibrate').expect(200, {
    status: 'ok',
  })
})

test('calibrate error', async () => {
  importer.doCalibrate.mockResolvedValueOnce(false)

  await request(app)
    .post('/scan/calibrate')
    .expect(200, {
      status: 'error',
      errors: [
        {
          type: 'calibration-error',
          message: 'scanner could not be calibrated',
        },
      ],
    })
})
