import { Application } from 'express'
import request from 'supertest'
import { buildApp } from './server'
import { Scanner } from './scanner'
import election from '../election.json'

jest.mock('./scanner')

let app: Application
let scanner: Scanner
let scannerMock: jest.Mocked<Scanner>

function makeMockScanner(): Scanner {
  return {
    addManualBallot: jest.fn(),
    configure: jest.fn(),
    doExport: jest.fn(),
    doScan: jest.fn(),
    doZero: jest.fn(),
    getStatus: jest.fn(),
    unconfigure: jest.fn(),
  }
}

beforeEach(async () => {
  scanner = makeMockScanner()
  scannerMock = scanner as jest.Mocked<Scanner>
  app = buildApp(scanner)
})

test('GET /scan/status', async () => {
  const status = {
    batches: [],
  }
  scannerMock.getStatus.mockResolvedValue(status)
  await request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
  expect(scanner.getStatus).toBeCalled()
})

test('POST /scan/configure', async () => {
  await request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(scanner.configure).toBeCalledWith(
    expect.objectContaining({
      title: '2020 General Election',
    })
  )
})

test('POST /scan/scanBatch', async () => {
  scannerMock.doScan.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(scanner.doScan).toBeCalled()
})

test('POST /scan/addManualBallot', async () => {
  scannerMock.addManualBallot.mockResolvedValue(undefined)
  await request(app)
    .post('/scan/addManualBallot')
    .send({
      ballotString: '12.23.1|0|0|0||||||||||||||||.r6UYR4t7hEFMz8ZlMWf1Sw',
    })
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(scanner.addManualBallot).toBeCalled()
})

test('POST /scan/invalidateBatch', async () => {
  await request(app)
    .post('/scan/invalidateBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
})

test('POST /scan/export', async () => {
  scannerMock.doExport.mockResolvedValue('')

  await request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
  expect(scanner.doExport).toBeCalled()
})

test('POST /scan/zero', async () => {
  scannerMock.doZero.mockResolvedValue()

  await request(app)
    .post('/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(scanner.doZero).toBeCalled()
})

test('POST /scan/unconfigure', async () => {
  scannerMock.unconfigure.mockResolvedValue()

  await request(app)
    .post('/scan/unconfigure')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
  expect(scanner.unconfigure).toBeCalled()
})

test('GET /', async () => {
  const response = await request(app)
    .get('/')
    .expect(200)
  expect(response.text).toContain('Test Page for Scan')
})
