import request from 'supertest'
import { app } from './server'
import * as scanner from './scanner'
import election from '../election.json'

jest.mock('./scanner')
const mockScanner = scanner as jest.Mocked<typeof scanner>

test('GET /scan/status', done => {
  const status = {
    batches: [],
  }
  mockScanner.getStatus.mockResolvedValue(status)
  request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
    .then(() => {
      expect(scanner.getStatus).toBeCalled()
      done()
    })
})

test('POST /scan/configure', done => {
  request(app)
    .post('/scan/configure')
    .send(election)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => {
      expect(scanner.configure).toBeCalledWith(
        expect.objectContaining({
          title: '2020 General Election',
        })
      )
      done()
    })
})

test('POST /scan/scanBatch', done => {
  mockScanner.doScan.mockResolvedValue('')
  request(app)
    .post('/scan/scanBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => {
      expect(scanner.doScan).toBeCalled()
      done()
    })
})

test('POST /scan/invalidateBatch', done => {
  request(app)
    .post('/scan/invalidateBatch')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => {
      expect(scanner.doScan).toBeCalled()
      done()
    })
})

test('POST /scan/export', done => {
  mockScanner.doExport.mockResolvedValue('')

  request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
    .then(() => {
      expect(scanner.doExport).toBeCalled()
      done()
    })
})

test('POST /scan/zero', done => {
  request(app)
    .post('/scan/zero')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => done())
})

test('POST /scan/unconfigure', done => {
  request(app)
    .post('/scan/unconfigure')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => done())
})

test('GET /', done => {
  request(app)
    .get('/')
    .expect(200)
    .then(response => {
      expect(response.text).toContain('Test Page for Scan')
      done()
    })
})
