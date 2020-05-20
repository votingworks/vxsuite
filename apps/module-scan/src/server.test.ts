import { Application } from 'express'
import request from 'supertest'
import { electionSample as election } from '@votingworks/ballot-encoder'
import { buildApp } from './server'
import { Importer } from './importer'
import Store from './store'

jest.mock('./importer')

let app: Application
let importer: Importer
let importerMock: jest.Mocked<Importer>

function makeMockImporter(): jest.Mocked<Importer> {
  return {
    addHmpbTemplate: jest.fn(),
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
  app = buildApp({ importer, store: await Store.memoryStore() })
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

test('POST /scan/configure', async () => {
  await request(app)
    .post('/scan/configure')
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

test('POST /scan/unconfigure', async () => {
  importerMock.unconfigure.mockResolvedValue()

  await request(app)
    .post('/scan/unconfigure')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(importer.unconfigure).toBeCalled()
})

test('GET /', async () => {
  const response = await request(app).get('/').expect(200)
  expect(response.text).toContain('Test Page for Scan')
})
