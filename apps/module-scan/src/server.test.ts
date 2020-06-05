import { Application } from 'express'
import request from 'supertest'
import { electionSample as election } from '@votingworks/ballot-encoder'
import { buildApp, start } from './server'
import { Importer } from './importer'
import Store from './store'
import { Server } from 'http'

jest.mock('./importer')

let app: Application
let importer: Importer
let store: Store
let importerMock: jest.Mocked<Importer>

function makeMockImporter(): jest.Mocked<Importer> {
  return {
    addHmpbTemplate: jest.fn(),
    addHmpbTemplates: jest.fn(),
    addManualBallot: jest.fn(),
    configure: jest.fn(),
    doExport: jest.fn(),
    doImport: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    unconfigure: jest.fn(),
  }
}

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

test('PUT /config/election', async () => {
  await request(app)
    .put('/config/election')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.configure).toBeCalledWith(
    expect.objectContaining({
      title: 'General Election',
    })
  )
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

test('DELETE /config/election', async () => {
  importerMock.unconfigure.mockResolvedValue()

  await request(app)
    .delete('/config/election')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.unconfigure).toBeCalled()
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
  jest
    .spyOn(app, 'listen')
    .mockReturnValueOnce((undefined as unknown) as Server)

  // configure election and add a few HMPB templates
  await store.setElection(election)
  await store.addHmpbTemplate(Buffer.of(1), {
    ballotStyleId: '77',
    precinctId: '42',
    isTestBallot: false,
  })
  await store.addHmpbTemplate(Buffer.of(2), {
    ballotStyleId: '77',
    precinctId: '43',
    isTestBallot: false,
  })

  // start up the server
  await start({ store, importer, app, log: jest.fn() })

  // did we load everything from the store?
  expect(importer.configure).toHaveBeenCalledWith(election)
  expect(importer.addHmpbTemplates).toHaveBeenNthCalledWith(1, Buffer.of(1))
  expect(importer.addHmpbTemplates).toHaveBeenNthCalledWith(2, Buffer.of(2))
})
