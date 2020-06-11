import { electionSample as election } from '@votingworks/ballot-encoder'
import { Application } from 'express'
import { promises as fs } from 'fs'
import { Server } from 'http'
import { join } from 'path'
import request from 'supertest'
import { makeMockImporter } from '../test/util/mocks'
import { Importer } from './importer'
import { buildApp, start } from './server'
import Store from './store'

jest.mock('./importer')

let app: Application
let importer: Importer
let store: Store
let importerMock: jest.Mocked<Importer>

beforeEach(async () => {
  importer = makeMockImporter()
  importerMock = importer as jest.Mocked<Importer>
  store = await Store.memoryStore()
  app = buildApp({ importer, store })
})

test('GET /scan/status', async () => {
  const status = {
    batches: [],
  }
  importerMock.getStatus.mockResolvedValue(status)
  await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
  expect(importer.getStatus).toBeCalled()
})

test('PATCH /config to set election', async () => {
  await request(app)
    .patch('/config')
    .send({ election })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.configure).toBeCalledWith(
    expect.objectContaining({
      title: 'General Election',
    })
  )
})

test('PATCH /config to delete election', async () => {
  importerMock.unconfigure.mockResolvedValue()

  await request(app)
    .patch('/config')
    .send({ election: null })
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.unconfigure).toBeCalled()
})

test('PATCH /config to set testMode', async () => {
  importerMock.setTestMode.mockResolvedValueOnce(undefined)

  await request(app)
    .patch('/config')
    .send({ testMode: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200)

  expect(importerMock.setTestMode).toHaveBeenNthCalledWith(1, true)

  await request(app)
    .patch('/config')
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .send({ testMode: false })
    .expect(200)

  expect(importerMock.setTestMode).toHaveBeenNthCalledWith(2, false)
})

test('PATCH /config rejects unknown properties', async () => {
  await request(app)
    .patch('/config')
    .send({ nope: true })
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(400)
})

test('POST /scan/scanBatch', async () => {
  importerMock.doImport.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.doImport).toBeCalled()
})

test('POST /scan/scanBatch errors', async () => {
  importerMock.doImport.mockRejectedValue(new Error('scanner is a teapot'))
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'could not scan: scanner is a teapot' })
  expect(importer.doImport).toBeCalled()
})

test('POST /scan/addManualBallot', async () => {
  importerMock.addManualBallot.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|0|0|0||||||||||||||||.r6UYR4t7hEFMz8ZlMWf1Sw',
    })
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.addManualBallot).toBeCalled()
})

test('POST /scan/invalidateBatch', async () => {
  await request(app)
    .post('/scan/invalidateBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
})

test('POST /scan/export', async () => {
  importerMock.doExport.mockResolvedValue('')

  await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
  expect(importer.doExport).toBeCalled()
})

test('POST /scan/zero', async () => {
  importerMock.doZero.mockResolvedValue()

  await request(app)
    .post('/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.doZero).toBeCalled()
})

test('GET /scan/batch/:batchId', async () => {
  const batchId = await store.addBatch()
  await store.addCVR(batchId, '/tmp/image.jpg', {
    _ballotId: 'abc',
    _ballotStyleId: '77',
    _precinctId: '42',
    _scannerId: 'def',
    _testBallot: false,
  })
  await store.finishBatch(batchId)

  await request(app)
    .get(`/scan/batch/${batchId}`)
    .set('Accept', 'application/json')
    .expect(200, [
      {
        id: 1,
        filename: '/tmp/image.jpg',
        cvr: {
          _ballotId: 'abc',
          _ballotStyleId: '77',
          _precinctId: '42',
          _scannerId: 'def',
          _testBallot: false,
        },
      },
    ])
})

test('GET /scan/batch/:batchId 404', async () => {
  await request(app)
    .get(`/scan/batch/999`)
    .set('Accept', 'application/json')
    .expect(404)
})

test('GET /scan/batch/:batchId/ballot/:ballotId', async () => {
  const batchId = await store.addBatch()
  const ballotId = await store.addCVR(batchId, '/tmp/image.jpg', {
    _ballotId: 'abc',
    _ballotStyleId: '77',
    _precinctId: '42',
    _scannerId: 'def',
    _testBallot: false,
  })
  await store.finishBatch(batchId)

  await request(app)
    .get(`/scan/batch/${batchId}/ballot/${ballotId}`)
    .set('Accept', 'application/json')
    .expect(200, {
      id: 1,
      filename: '/tmp/image.jpg',
      cvr: {
        _ballotId: 'abc',
        _ballotStyleId: '77',
        _precinctId: '42',
        _scannerId: 'def',
        _testBallot: false,
      },
    })
})

test('GET /scan/batch/:batchId/ballot/:ballotId 404', async () => {
  await request(app)
    .get(`/scan/batch/999/ballot/111`)
    .set('Accept', 'application/json')
    .expect(404)
})

test('GET /scan/batch/:batchId/ballot/:ballotId/image', async () => {
  const filename = join(
    __dirname,
    '../test/fixtures/hmpb-dallas-county/filled-in-p1.jpg'
  )
  const batchId = await store.addBatch()
  const ballotId = await store.addCVR(batchId, filename, {
    _ballotId: 'abc',
    _ballotStyleId: '77',
    _precinctId: '42',
    _scannerId: 'def',
    _testBallot: false,
  })
  await store.finishBatch(batchId)

  await request(app)
    .get(`/scan/batch/${batchId}/ballot/${ballotId}/image`)
    .set('Accept', 'application/json')
    .expect(200, await fs.readFile(filename))
})

test('GET /scan/batch/:batchId/ballot/:ballotId/image 404', async () => {
  await request(app)
    .get(`/scan/batch/999/ballot/111`)
    .set('Accept', 'application/json')
    .expect(404)
})

test('GET /', async () => {
  const response = await request(app).get('/').expect(200)
  expect(response.text).toContain('Test Page for Scan')
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
  importerMock.addHmpbTemplates.mockResolvedValueOnce([
    {
      ballotStyleId: '77',
      precinctId: '42',
      isTestBallot: false,
      pageNumber: 1,
      pageCount: 2,
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
            isTestBallot: false,
          })
        )
      ),
      { filename: 'metadata.json', contentType: 'application/json' }
    )
    .expect(200)

  expect(JSON.parse(response.text)).toEqual({ status: 'ok' })

  expect(await store.getHmpbTemplates()).toEqual([
    [
      Buffer.of(4, 5, 6),
      {
        ballotStyleId: '77',
        precinctId: '42',
        isTestBallot: false,
      },
    ],
  ])
})

test('start reloads configuration from the store', async () => {
  // don't actually listen
  jest.spyOn(app, 'listen').mockImplementationOnce((_port, onListening) => {
    onListening?.()
    return (undefined as unknown) as Server
  })

  // start up the server
  await start({ store, importer, app, log: jest.fn() })

  // did we load everything from the store?
  expect(importer.restoreConfig).toHaveBeenCalled()
})
