import { fireEvent, render, screen } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  advanceTimers,
  advanceTimersAndPromises,
  fakeKiosk,
  fakeUsbDrive,
  makeAdminCard,
  makePollWorkerCard,
  makeVoterCard,
} from '@votingworks/test-utils'
import { AdjudicationReason, BallotSheetInfo } from '@votingworks/types'
import {
  GetCurrentPrecinctConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import fetchMock from 'fetch-mock'
import { DateTime } from 'luxon'
import React from 'react'
import {
  MemoryCard,
  MemoryStorage,
  MemoryHardware,
  typedAs,
} from '@votingworks/utils'
import { interpretedHmpb } from '../test/fixtures'
import App from './App'
import { stateStorageKey } from './AppRoot'

const getMachineConfigBody = {
  machineId: '0002',
  codeVersion: '3.14',
}

const getTestModeConfigTrueResponseBody: GetTestModeConfigResponse = {
  status: 'ok',
  testMode: true,
}

const scanStatusWaitingForPaperResponseBody: GetScanStatusResponse = {
  scanner: ScannerStatus.WaitingForPaper,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
}

const scanStatusReadyToScanResponseBody: GetScanStatusResponse = {
  scanner: ScannerStatus.ReadyToScan,
  batches: [],
  adjudication: { adjudicated: 0, remaining: 0 },
}

const getPrecinctConfigNoPrecinctResponseBody: GetCurrentPrecinctConfigResponse = {
  status: 'ok',
}

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

test('when module-scan does not respond shows loading screen', async () => {
  fetchMock.get('/config/election', { status: 404 })
  fetchMock.get('/machine-config', { body: getMachineConfigBody })

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  render(<App card={card} hardware={hardware} />)
  await screen.findByText('Loading Configuration…')
})

test('module-scan fails to unconfigure', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .get('/scan/status', scanStatusWaitingForPaperResponseBody)
    .deleteOnce('/config/election', { status: 404 })

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  render(<App card={card} hardware={hardware} />)
  const adminCard = makeAdminCard(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, electionSampleDefinition.electionData)
  await advanceTimersAndPromises(1)
  await screen.findByText('Administrator Settings')

  fireEvent.click(await screen.findByText('Unconfigure Machine'))
  fireEvent.click(await screen.findByText('Unconfigure'))

  await screen.findByText('Loading')
})

test('Show error if usb drive has multiple zip files', async () => {
  const storage = new MemoryStorage()
  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  const kiosk = fakeKiosk()
  kiosk.getUsbDrives.mockResolvedValue([])
  window.kiosk = kiosk
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .getOnce('/config/election', new Response('null'))
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  render(<App storage={storage} card={card} hardware={hardware} />)
  await screen.findByText('Loading Configuration…')
  await advanceTimersAndPromises(1)
  await screen.findByText('Precinct Scanner is Not Configured')
  await screen.findByText('Insert USB Drive with configuration.')

  const fakeZipFile = {
    name: 'ballot-package.zip',
    path: 'path',
    type: 1,
    size: 1,
    atime: new Date(),
    ctime: new Date(),
    mtime: new Date(),
  }

  kiosk.getFileSystemEntries.mockResolvedValue([fakeZipFile, fakeZipFile])
  kiosk.getUsbDrives.mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(2)
  await screen.findByText(
    'Error in configuration: More than one ballot package found on the inserted USB drive, make sure only one is present.'
  )
})

test('Show invalid card screen when unsupported cards are given', async () => {
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .deleteOnce('/config/election', { status: 404 })
    .get('/scan/status', scanStatusWaitingForPaperResponseBody)

  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  render(<App card={card} hardware={hardware} />)
  await screen.findByText('Polls Closed')
  const voterCard = makeVoterCard(electionSampleDefinition.election)
  card.insertCard(voterCard)
  await advanceTimersAndPromises(1)
  await screen.findByText('Invalid Card, please remove.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises(1)
  await screen.findByText('Polls Closed')

  // Insert an invalid card
  card.insertCard(JSON.stringify({ t: 'something' }))
  await advanceTimersAndPromises(2)
  await screen.findByText('Invalid Card, please remove.')

  // Remove card
  card.removeCard()
  await advanceTimersAndPromises(1)
  await screen.findByText('Polls Closed')

  const pollWorkerCardWrongElection = makePollWorkerCard(
    'this-is-not-the-right-hash'
  )
  card.insertCard(pollWorkerCardWrongElection)
  await advanceTimersAndPromises(1)
  await screen.findByText('Invalid Card, please remove.')
})

test('error from module-scan in accepting a reviewable ballot', async () => {
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', {
      body: getPrecinctConfigNoPrecinctResponseBody,
    })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  render(<App storage={storage} card={card} hardware={hardware} />)
  advanceTimers(1)
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  fetchMock.getOnce(
    '/scan/status',
    { body: scanStatusReadyToScanResponseBody },
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.getOnce(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: false, repeat: 1 }
  )
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: false }
  )
  fetchMock.get(
    '/scan/hmpb/review/next-sheet',
    typedAs<BallotSheetInfo>({
      id: 'test-sheet',
      front: {
        interpretation: interpretedHmpb({
          electionDefinition: electionSampleDefinition,
          pageNumber: 1,
          adjudicationReason: AdjudicationReason.Overvote,
        }),
        image: { url: '/not/real.jpg' },
      },
      back: {
        interpretation: interpretedHmpb({
          electionDefinition: electionSampleDefinition,
          pageNumber: 2,
        }),
        image: { url: '/not/real.jpg' },
      },
    })
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Ballot Requires Review')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'error' },
  })

  fireEvent.click(await screen.findByText('Count Ballot'))
  fireEvent.click(await screen.findByText('Yes, count ballot with errors'))
  await screen.findByText('Scanning Error')
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
  await advanceTimersAndPromises(5)
  // Screen does NOT reset automatically to insert ballot screen
  await screen.findByText('Scanning Error')
  // Removing ballot resets to insert screen
  fetchMock.get(
    '/scan/status',
    { body: scanStatusWaitingForPaperResponseBody },
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
})

test('error from module-scan in ejecting a reviewable ballot', async () => {
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', electionSampleDefinition)
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  const card = new MemoryCard()
  const hardware = await MemoryHardware.buildStandard()
  render(<App storage={storage} card={card} hardware={hardware} />)
  advanceTimers(1)
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  fetchMock.getOnce(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    }),
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.getOnce(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: false, repeat: 1 }
  )
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: false }
  )
  fetchMock.get(
    '/scan/hmpb/review/next-sheet',
    typedAs<BallotSheetInfo>({
      id: 'test-sheet',
      front: {
        interpretation: interpretedHmpb({
          electionDefinition: electionSampleDefinition,
          pageNumber: 1,
          adjudicationReason: AdjudicationReason.Overvote,
        }),
        image: { url: '/not/real.jpg' },
      },
      back: {
        interpretation: interpretedHmpb({
          electionDefinition: electionSampleDefinition,
          pageNumber: 2,
        }),
        image: { url: '/not/real.jpg' },
      },
    })
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Ballot Requires Review')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'error' },
  })
  fetchMock.get(
    '/scan/status',
    typedAs<GetScanStatusResponse>({
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          label: 'Batch 1',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    }),
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
})
