import { ScannerError } from './errors'
import { Errors, MockScannerClient } from './mocks'
import { PaperStatus } from './paper-status'

const files: readonly string[] = ['/tmp/a.jpg', '/tmp/b.jpg']

beforeEach(() => {
  jest.useRealTimers()
})

test('connection', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  await mock.connect()
  expect(mock.isConnected()).toBeTruthy()
  await mock.disconnect()
  expect(mock.isConnected()).toBeFalsy()
})

test('loading', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })

  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.NotConnected
  )
  expect((await mock.getPaperStatus()).err()).toEqual(ScannerError.NoDevices)
  expect((await mock.simulateRemoveSheet()).err()).toEqual(Errors.NotConnected)

  await mock.connect()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
  expect((await mock.simulateRemoveSheet()).err()).toEqual(
    Errors.NoPaperToRemove
  )
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined()
  expect((await mock.getPaperStatus()).ok()).toEqual(PaperStatus.VtmReadyToScan)
  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.DuplicateLoad
  )
  expect((await mock.simulateRemoveSheet()).err()).toBeUndefined()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
  expect((await mock.simulateLoadSheet(files)).err()).toBeUndefined()
  expect((await mock.getPaperStatus()).ok()).toEqual(PaperStatus.VtmReadyToScan)
})

test('unresponsive', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })

  await mock.connect()
  expect(mock.isConnected()).toEqual(true)
  await mock.simulateUnresponsive()

  expect(mock.isConnected()).toEqual(true)
  expect((await mock.simulateLoadSheet(files)).err()).toEqual(
    Errors.Unresponsive
  )
  expect((await mock.simulateRemoveSheet()).err()).toEqual(Errors.Unresponsive)
  expect((await mock.accept()).err()).toEqual(ScannerError.SaneStatusIoError)
  expect((await mock.calibrate()).err()).toEqual(ScannerError.SaneStatusIoError)
  expect((await mock.getPaperStatus()).err()).toEqual(
    ScannerError.SaneStatusIoError
  )
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.SaneStatusIoError
  )
  expect((await mock.scan()).err()).toEqual(
    ScannerError.PaperStatusErrorFeeding
  )
  expect(
    (await mock.waitForStatus({ status: PaperStatus.VtmReadyToScan }))?.err()
  ).toEqual(ScannerError.SaneStatusIoError)
  ;(await mock.close()).unwrap()
})

test('scanning', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect((await mock.scan()).err()).toEqual(ScannerError.NoDevices)
  await mock.connect()

  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsDevReadyNoPaper)
  await mock.simulateLoadSheet(files)
  expect((await mock.scan()).ok()).toEqual({ files })
  expect((await mock.scan()).err()).toEqual(ScannerError.VtmPsReadyToEject)
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmReadyToEject
  )
})

test('accept', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect((await mock.accept()).err()).toEqual(ScannerError.NoDevices)
  await mock.connect()

  expect((await mock.accept()).err()).toEqual(ScannerError.VtmPsDevReadyNoPaper)

  // accept w/o scan
  await mock.simulateLoadSheet(files)
  ;(await mock.accept()).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )

  // accept w/scan
  await mock.simulateLoadSheet(files)
  await mock.scan()
  ;(await mock.accept()).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
})

test('reject & hold', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.NoDevices
  )
  await mock.connect()

  expect((await mock.reject({ hold: true })).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  )

  // reject w/o scan
  await mock.simulateLoadSheet(files)
  ;(await mock.reject({ hold: true })).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(PaperStatus.VtmReadyToScan)

  // reject w/scan
  await mock.simulateLoadSheet(files)
  await mock.scan()
  ;(await mock.reject({ hold: true })).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(PaperStatus.VtmReadyToScan)
})

test('reject w/o hold', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect((await mock.reject({ hold: false })).err()).toEqual(
    ScannerError.NoDevices
  )
  await mock.connect()

  expect((await mock.reject({ hold: false })).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  )

  // reject w/o scan
  await mock.simulateLoadSheet(files)
  ;(await mock.reject({ hold: false })).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )

  // reject w/scan
  await mock.simulateLoadSheet(files)
  await mock.scan()
  ;(await mock.reject({ hold: false })).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
})

test('calibrate', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect((await mock.calibrate()).err()).toEqual(ScannerError.NoDevices)
  await mock.connect()

  expect((await mock.calibrate()).err()).toEqual(
    ScannerError.VtmPsDevReadyNoPaper
  )

  await mock.simulateLoadSheet(files)
  await mock.scan()
  expect((await mock.calibrate()).err()).toEqual(ScannerError.SaneStatusNoDocs)
  await mock.reject({ hold: true })
  ;(await mock.calibrate()).unwrap()
  expect((await mock.getPaperStatus()).ok()).toEqual(
    PaperStatus.VtmDevReadyNoPaper
  )
})

test('waitForStatus', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  expect(
    (await mock.waitForStatus({ status: PaperStatus.VtmReadyToScan }))?.err()
  ).toEqual(ScannerError.NoDevices)
  await mock.connect()

  expect(
    (
      await mock.waitForStatus({ status: PaperStatus.Scanning, timeout: 5 })
    )?.ok()
  ).toEqual(PaperStatus.VtmDevReadyNoPaper)

  expect(
    await mock.waitForStatus({ status: PaperStatus.Scanning, timeout: 0 })
  ).toBeUndefined()

  expect(
    (await mock.waitForStatus({ status: PaperStatus.VtmDevReadyNoPaper }))?.ok()
  ).toEqual(PaperStatus.VtmDevReadyNoPaper)
})

test('close', async () => {
  const mock = new MockScannerClient({
    toggleHoldDuration: 0,
    passthroughDuration: 0,
  })
  await mock.connect()
  await mock.close()
  expect(mock.isConnected()).toBeFalsy()
})

test('operation timing', async () => {
  jest.useFakeTimers()

  const mock = new MockScannerClient()
  await mock.connect()

  const loadPromise = mock.simulateLoadSheet(files)
  jest.advanceTimersByTime(100)
  await loadPromise

  const scanPromise = mock.scan()
  jest.advanceTimersByTime(1000)
  await scanPromise
})
