import request from 'supertest'
import { app } from './server'
import * as scanner from './scanner'
import election from '../election.json'

jest.mock('./scanner')
const mockScanner = scanner as jest.Mocked<typeof scanner>

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

test('POST /scan/scan', done => {
  request(app)
    .post('/scan/scan')
    .set('Accept', 'application/json')
    .expect(200, { status: 'ok' })
    .then(() => {
      expect(scanner.doScan).toBeCalled()
      done()
    })
})

test('POST /scan/export', done => {
  mockScanner.doExport.mockImplementation(
    (callback: (arg0: string) => void) => {
      callback('')
    }
  )
  request(app)
    .post('/scan/export')
    .set('Accept', 'application/json')
    .expect(200, '')
    .then(() => {
      expect(scanner.doExport).toBeCalled()
      done()
    })
})

test('GET /scan/status', done => {
  const status = {
    status: 'scanning',
    numBallotsScanned: 85,
    message: '20 ballots scanned in batch',
  }
  mockScanner.getStatus.mockReturnValue(status)
  request(app)
    .get('/scan/status')
    .set('Accept', 'application/json')
    .expect(200, status)
    .then(() => {
      expect(scanner.getStatus).toBeCalled()
      done()
    })
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
