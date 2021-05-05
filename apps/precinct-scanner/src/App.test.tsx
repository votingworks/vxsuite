import React from 'react'
import fetchMock from 'fetch-mock'
import { promises as fs } from 'fs'
import {
  ScannerStatus,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  GetCurrentPrecinctConfigResponse,
} from '@votingworks/types/api/module-scan'
import { render, waitFor, fireEvent, screen } from '@testing-library/react'
import {
  fakeKiosk,
  fakeUsbDrive,
  advanceTimers,
  advanceTimersAndPromises,
} from '@votingworks/test-utils'
import { join } from 'path'
import { electionSampleDefinition } from '@votingworks/fixtures'

import { DateTime } from 'luxon'
import { AdjudicationReason } from '@votingworks/types'
import { getZeroTally } from '@votingworks/utils/src'
import App from './App'
import { BallotSheetInfo, TallySourceMachineType } from './config/types'
import { interpretedHmpb } from '../test/fixtures'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import { MemoryStorage } from './utils/Storage'
import {
  adminCardForElection,
  pollWorkerCardForElection,
} from '../test/helpers/smartcards'
import { stateStorageKey } from './AppRoot'

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

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

test('app can load and configure from a usb stick', async () => {
  const storage = new MemoryStorage()
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject')
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .getOnce('/config/election', new Response('null'))
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  render(<App storage={storage} card={card} hardware={hardware} />)
  await screen.findByText('Loading Configuration…')
  jest.advanceTimersByTime(1001)
  await screen.findByText('Precinct Scanner is Not Configured')
  await screen.findByText('Insert USB Drive with configuration.')

  const kiosk = fakeKiosk()
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  window.kiosk = kiosk
  jest.advanceTimersByTime(2001)

  await screen.findByText(
    'Error in configuration: No ballot package found on the inserted USB drive.'
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  await advanceTimersAndPromises(2)
  await screen.findByText('Insert USB Drive with configuration.')

  // Mock getFileSystemEntries returning an error
  kiosk.getFileSystemEntries = jest.fn().mockRejectedValueOnce('error')
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(2)
  await screen.findByText(
    'Error in configuration: No ballot package found on the inserted USB drive.'
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  await advanceTimersAndPromises(2)
  await screen.findByText('Insert USB Drive with configuration.')

  const pathToFile = join(
    __dirname,
    '../test/fixtures/ballot-package-state-of-hamilton.zip'
  )
  kiosk.getFileSystemEntries = jest.fn().mockResolvedValue([
    {
      name: 'ballot-package.zip',
      path: pathToFile,
      type: 1,
    },
  ])
  const fileContent = await fs.readFile(pathToFile)
  kiosk.readFile = jest.fn().mockResolvedValue(fileContent)

  fetchMock
    .patchOnce('/config/testMode', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .patchOnce('/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .post('/scan/hmpb/addTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .post('/scan/hmpb/doneTemplates', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .get('/config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })

  // Reinsert USB now that fake zip file on it is setup
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(2)
  await advanceTimersAndPromises(0)
  await screen.findByText('Polls Closed')
  expect(fetchMock.calls('/config/election', { method: 'PATCH' })).toHaveLength(
    1
  )
  expect(fetchMock.calls('/scan/hmpb/addTemplates')).toHaveLength(16)
  expect(fetchMock.calls('/scan/hmpb/doneTemplates')).toHaveLength(1)

  fetchMock.delete('./config/election', {
    body: '{"status": "ok"}',
    status: 200,
  })

  // Insert a pollworker card
  fetchMock.post('/scan/export', {})
  const pollWorkerCard = pollWorkerCardForElection(
    electionSampleDefinition.electionHash
  )
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises(1)
  await screen.findByText('Poll Worker Actions')

  // Open Polls
  fireEvent.click(await screen.findByText('Open Polls for All Precincts'))
  fireEvent.click(await screen.findByText('Save Report and Open Polls'))
  await screen.findByText('Saving to Card')
  await screen.findByText('Close Polls for All Precincts')
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1)
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 0,
      metadata: [
        {
          ballotCount: 0,
          machineId: '0002',
          timeSaved: expect.anything(),
        },
      ],
      tally: getZeroTally(electionSampleDefinition.election),
    })
  )
  expect(fetchMock.calls('/scan/export')).toHaveLength(1)

  // Remove card and see Insert Ballot Screen
  card.removeCard()
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  // Remove the USB drive
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(1)

  // Insert admin card to unconfigure
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  await screen.findByText('Administrator Settings')

  fireEvent.click(await screen.findByText('Unconfigure Machine'))
  fireEvent.click(await screen.findByText('Unconfigure'))
  await screen.findByText('Loading…')
  await waitFor(() =>
    expect(fetchMock.calls('./config/election', { method: 'DELETE' }))
  )
})

test('voter can cast a ballot that scans succesfully ', async () => {
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  const writeLongObjectMock = jest.spyOn(card, 'writeLongObject')

  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  render(<App card={card} hardware={hardware} storage={storage} />)
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get('/scan/status', scanStatusReadyToScanResponseBody, {
    overwriteRoutes: true,
    repeat: 3,
  })
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', {
    id: 'test-sheet',
    front: {
      interpretation: interpretedHmpb({
        electionDefinition: electionSampleDefinition,
        pageNumber: 1,
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
  } as BallotSheetInfo)
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false, repeat: 2 }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Your ballot was counted!')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await screen.findByText('Scan one ballot sheet at a time.')
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1')

  // Insert a pollworker card
  fetchMock.post('/scan/export', {
    _precinctId: '23',
    _ballotStyleId: '12',
    president: ['cramer-vuocolo'],
    senator: [],
    'secretary-of-state': ['shamsi', 'talarico'],
    'county-registrar-of-wills': ['writein'],
    'judicial-robert-demergue': ['yes'],
  })
  const pollWorkerCard = pollWorkerCardForElection(
    electionSampleDefinition.electionHash
  )
  card.insertCard(pollWorkerCard)
  await advanceTimersAndPromises(1)
  await screen.findByText('Poll Worker Actions')

  // Close Polls
  fireEvent.click(await screen.findByText('Close Polls for All Precincts'))
  fireEvent.click(await screen.findByText('Save Report and Close Polls'))
  await screen.findByText('Saving to Card')
  await screen.findByText('Open Polls for All Precincts')
  expect(writeLongObjectMock).toHaveBeenCalledTimes(1)
  expect(writeLongObjectMock).toHaveBeenCalledWith(
    expect.objectContaining({
      isLiveMode: false,
      tallyMachineType: TallySourceMachineType.PRECINCT_SCANNER,
      totalBallotsScanned: 1,
      metadata: [
        {
          ballotCount: 1,
          machineId: '0002',
          timeSaved: expect.anything(),
        },
      ],
      // The export endpoint is mocked to return no CVR data so we still expect a zero tally
      tally: expect.arrayContaining([
        {
          candidates: [0, 1, 0, 0, 0, 0],
          writeIns: 0,
          undervotes: 0,
          overvotes: 0,
          ballotsCast: 1,
        }, // President expected tally
        {
          candidates: [0, 0, 0, 0, 0, 0, 0],
          writeIns: 0,
          undervotes: 1,
          overvotes: 0,
          ballotsCast: 1,
        }, // Senator expected tally
        {
          candidates: [0, 0],
          writeIns: 0,
          undervotes: 0,
          overvotes: 1,
          ballotsCast: 1,
        }, // Secretary of State expected tally
        {
          candidates: [0],
          writeIns: 1,
          undervotes: 0,
          overvotes: 0,
          ballotsCast: 1,
        }, // County Registrar of Wills expected tally
        {
          yes: 1,
          no: 0,
          undervotes: 0,
          overvotes: 0,
          ballotsCast: 1,
        }, // Judicial Robert Demergue expected tally
      ]),
    })
  )
  expect(fetchMock.calls('/scan/export')).toHaveLength(1)
})

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
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
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false, repeat: 1 }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )
  fetchMock.get('/scan/hmpb/review/next-sheet', {
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
  } as BallotSheetInfo)
  await advanceTimersAndPromises(1)
  await screen.findByText('Overvote Warning')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)

  fetchMock.post('/scan/scanContinue', {
    body: { status: 'ok' },
  })

  fireEvent.click(await screen.findByText('Tabulate Ballot'))
  await screen.findByText('Tabulate Ballot with Errors?')
  fireEvent.click(await screen.findByText('Yes, Tabulate Ballot'))
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true }
  )
  await screen.findByText('Your ballot was counted!')
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
  advanceTimers(5)
  await screen.findByText('Insert Your Ballot Below')
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1')

  // Simulate another ballot
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.post(
    '/scan/scanBatch',
    {
      body: { status: 'ok', batchId: 'test-batch2' },
    },
    { overwriteRoutes: true }
  )
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false, repeat: 1 }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Overvote Warning')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(2)

  // Simulate voter pulling out the ballot
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          count: 0,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
  expect(fetchMock.calls('scan/scanContinue')).toHaveLength(2)
})

test('voter can cast a rejected ballot', async () => {
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .getOnce('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  render(<App storage={storage} card={card} hardware={hardware} />)
  advanceTimers(1)
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    },
    { overwriteRoutes: true }
  )
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', {
    id: 'test-sheet',
    front: {
      interpretation: {
        type: 'InvalidElectionHashPage',
        expectedElectionHash: 'a',
        actualElectionHash: 'b',
      },
      image: { url: '/not/real.jpg' },
    },
    back: {
      interpretation: interpretedHmpb({
        electionDefinition: electionSampleDefinition,
        pageNumber: 2,
      }),
      image: { url: '/not/real.jpg' },
    },
  } as BallotSheetInfo)
  await advanceTimersAndPromises(1)
  await screen.findByText('Scanning Error')
  await screen.findByText(
    'Scanned ballot does not match the election this scanner is configured for.'
  )
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'ok' },
  })

  // When the voter removes the ballot return to the insert ballot screen
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 0,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    },
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
})

test('voter can cast another ballot while the success screen is showing', async () => {
  const storage = new MemoryStorage()
  await storage.set(stateStorageKey, { isPollsOpen: true })
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  fetchMock
    .get('/machine-config', { body: getMachineConfigBody })
    .get('/config/election', { body: electionSampleDefinition })
    .get('/config/testMode', { body: getTestModeConfigTrueResponseBody })
    .get('/config/precinct', { body: getPrecinctConfigNoPrecinctResponseBody })
    .get('/scan/status', { body: scanStatusWaitingForPaperResponseBody })
  render(<App storage={storage} card={card} hardware={hardware} />)
  await advanceTimersAndPromises(1)
  await screen.findByText('Insert Your Ballot Below')
  await screen.findByText('Scan one ballot sheet at a time.')
  await screen.findByText('General Election')
  await screen.findByText(/Franklin County/)
  await screen.findByText(/State of Hamilton/)
  await screen.findByText('Election ID')
  await screen.findByText('2f6b1553c7')

  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false, repeat: 2 }
  )
  fetchMock.getOnce('/scan/hmpb/review/next-sheet', {
    id: 'test-sheet',
    front: {
      interpretation: interpretedHmpb({
        electionDefinition: electionSampleDefinition,
        pageNumber: 1,
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
  } as BallotSheetInfo)
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )
  await advanceTimersAndPromises(1)
  await screen.findByText('Your ballot was counted!')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1')
  await screen.findByText('Your ballot was counted!') // Still on the success screen
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true, repeat: 3 }
  )
  fetchMock.post(
    '/scan/scanBatch',
    {
      body: { status: 'ok', batchId: 'test-batch2' },
    },
    { overwriteRoutes: true }
  )
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false, repeat: 2 }
  )
  fetchMock.getOnce(
    '/scan/hmpb/review/next-sheet',
    {
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
    } as BallotSheetInfo,
    { overwriteRoutes: true }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        {
          id: 'test-batch',
          count: 1,
          startedAt: DateTime.now().toISO(),
          endedAt: DateTime.now().toISO(),
        },
        {
          id: 'test-batch2',
          count: 1,
          startedAt: DateTime.now().toISO(),
        },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: false }
  )

  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await waitFor(() => expect(fetchMock.calls('scan/scanBatch')).toHaveLength(2))
  await screen.findByText('Overvote Warning')
  // Even after the timeout to expire the success screen occurs we stay on the review screen.
  await advanceTimersAndPromises(5)
  await screen.findByText('Overvote Warning')
  // No more ballots have scanned even though the scanner is ready for paper
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(2)
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  await screen.findByText('Administrator Settings')
  expect((await screen.findByTestId('ballot-count')).textContent).toBe('1')
})
