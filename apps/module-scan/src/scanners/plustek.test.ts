import {
  MockScannerClient,
  PaperStatus,
  ScannerError,
} from '@votingworks/plustek-sdk'
import { err, ok } from '@votingworks/types'
import { ScannerStatus } from '@votingworks/types/api/module-scan'
import request from 'supertest'
import { makeMockPlustekClient } from '../../test/util/mocks'
import { plustekMockServer, PlustekScanner, withReconnect } from './plustek'

test('plustek scanner cannot get client', async () => {
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(err(new Error('no client for you!'))),
  })
  expect(await scanner.getStatus()).toEqual(ScannerStatus.Error)
  expect(await scanner.calibrate()).toEqual(false)

  const batch = scanner.scanSheets()
  expect(await batch.scanSheet()).toBeUndefined()
  expect(await batch.acceptSheet()).toEqual(false)
  expect(await batch.reviewSheet()).toEqual(false)
  expect(await batch.rejectSheet()).toEqual(false)
})

test('plustek scanner simplifies underlying status', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  })

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmDevReadyNoPaper)
  )
  expect(await scanner.getStatus()).toEqual(ScannerStatus.WaitingForPaper)

  plustekClient.getPaperStatus.mockResolvedValueOnce(
    ok(PaperStatus.VtmReadyToScan)
  )
  expect(await scanner.getStatus()).toEqual(ScannerStatus.ReadyToScan)

  plustekClient.getPaperStatus.mockResolvedValueOnce(ok(PaperStatus.Jam))
  expect(await scanner.getStatus()).toEqual(ScannerStatus.Error)
})

test('plustek scanner scanning', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  })

  plustekClient.scan.mockResolvedValueOnce(
    ok({ files: ['/tmp/a.jpg', '/tmp/b.jpg'] })
  )
  expect(await scanner.scanSheets().scanSheet()).toEqual([
    '/tmp/a.jpg',
    '/tmp/b.jpg',
  ])

  plustekClient.scan.mockResolvedValueOnce(err(ScannerError.NoDevices))
  expect(await scanner.scanSheets().scanSheet()).toBeUndefined()
})

test('plustek scanner accept sheet', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  })

  // successful accept
  plustekClient.accept.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(ok(PaperStatus.NoPaper))
  expect(await scanner.scanSheets().acceptSheet()).toEqual(true)

  // failed accept
  plustekClient.accept.mockResolvedValueOnce(err(ScannerError.Fail))
  expect(await scanner.scanSheets().acceptSheet()).toEqual(false)

  // failed to get correct final status
  plustekClient.accept.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(undefined)
  expect(await scanner.scanSheets().acceptSheet()).toEqual(false)
})

test('plustek scanner review sheet', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  })

  // successful review
  plustekClient.reject.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(ok(PaperStatus.VtmReadyToScan))
  expect(await scanner.scanSheets().reviewSheet()).toEqual(true)

  // failed review
  plustekClient.reject.mockResolvedValueOnce(err(ScannerError.Fail))
  expect(await scanner.scanSheets().reviewSheet()).toEqual(false)

  // failed to get correct final status
  plustekClient.reject.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(undefined)
  expect(await scanner.scanSheets().reviewSheet()).toEqual(false)
})

test('plustek scanner reject sheet', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner({
    get: jest.fn().mockResolvedValue(ok(plustekClient)),
  })

  // successful reject
  plustekClient.reject.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(
    ok(PaperStatus.VtmDevReadyNoPaper)
  )
  expect(await scanner.scanSheets().rejectSheet()).toEqual(true)

  // failed reject
  plustekClient.reject.mockResolvedValueOnce(err(ScannerError.Fail))
  expect(await scanner.scanSheets().rejectSheet()).toEqual(false)

  // failed to get correct final status
  plustekClient.reject.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(undefined)
  expect(await scanner.scanSheets().rejectSheet()).toEqual(false)
})

test('plustek scanner reject sheet w/alwaysHoldOnReject', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner(
    {
      get: jest.fn().mockResolvedValue(ok(plustekClient)),
    },
    true
  )

  plustekClient.reject.mockResolvedValueOnce(ok(undefined))
  plustekClient.waitForStatus.mockResolvedValue(ok(PaperStatus.VtmReadyToScan))
  expect(await scanner.scanSheets().rejectSheet()).toEqual(true)
})

test('plustek scanner calibrate', async () => {
  const plustekClient = makeMockPlustekClient()
  const scanner = new PlustekScanner(
    {
      get: jest.fn().mockResolvedValue(ok(plustekClient)),
    },
    true
  )

  plustekClient.calibrate.mockResolvedValueOnce(ok(undefined))
  expect(await scanner.calibrate()).toEqual(true)

  plustekClient.calibrate.mockResolvedValueOnce(
    err(ScannerError.VtmPsDevReadyNoPaper)
  )
  expect(await scanner.calibrate()).toEqual(false)
})

// eslint-disable-next-line jest/expect-expect
test('mock server', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  })
  const app = plustekMockServer(client)

  // before connect fails
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(400)

  await client.connect()

  // bad request
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({
      /* missing files */
    })
    .expect(400)

  // successful
  await request(app)
    .put('/mock')
    .set('Content-Type', 'application/json')
    .send({ files: ['front.jpg', 'back.jpg'] })
    .expect(200)

  // removes mock
  await request(app).delete('/mock').expect(200)

  // fails because it's already removed
  await request(app).delete('/mock').expect(400)
})

test('withReconnect', async () => {
  const client = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  })
  await client.connect()
  const unresponsiveClient = new MockScannerClient({
    passthroughDuration: 0,
    toggleHoldDuration: 0,
  })
  await client.connect()
  await unresponsiveClient.simulateUnresponsive()

  // set up provider to fail before eventually succeeding
  const getClient = jest
    .fn()
    .mockResolvedValueOnce(ok(unresponsiveClient))
    .mockResolvedValueOnce(ok(unresponsiveClient))
    .mockResolvedValueOnce(ok(unresponsiveClient))
    .mockResolvedValueOnce(ok(client))
  const provider = withReconnect({ get: getClient })

  // ensure we tried until we got to the good client
  const wrappedClient = (await provider.get()).unwrap()
  expect(wrappedClient).toBeDefined()
  expect((await wrappedClient.getPaperStatus()).unwrap()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
  expect(getClient).toHaveBeenCalledTimes(4)

  // getting the client again should return the same one
  const wrappedClientAgain = (await provider.get()).unwrap()
  expect(wrappedClientAgain).toBe(wrappedClient)
  expect(getClient).toHaveBeenCalledTimes(4)

  // interacting with the good client works
  await client.simulateLoadSheet(['/tmp/a.jpg', '/tmp/b.jpg'])
  ;(await wrappedClient.scan()).unwrap()
  ;(await wrappedClient.reject({ hold: true })).unwrap()
  ;(await wrappedClient.accept()).unwrap()

  await client.simulateLoadSheet(['/tmp/blank.jpg', '/tmp/blank.jpg'])
  ;(await wrappedClient.calibrate()).unwrap()
})
