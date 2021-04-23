import React from 'react'
import fetchMock from 'fetch-mock'
import { promises as fs } from 'fs'
import {
  ScannerStatus,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
} from '@votingworks/types/api/module-scan'
import { render, waitFor, fireEvent } from '@testing-library/react'
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
import App from './App'
import { BallotSheetInfo } from './config/types'
import { interpretedHmpb } from '../test/fixtures'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import { adminCardForElection } from '../test/helpers/smartcards'

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

test('app can load and configure from a usb stick', async () => {
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  fetchMock.getOnce('/config/election', new Response('null'))
  fetchMock.get('/config/testMode', getTestModeResponseBody)
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as GetScanStatusResponse)
  const { getByText } = render(<App card={card} hardware={hardware} />)
  await waitFor(() => getByText('Loading Configuration…'))
  jest.advanceTimersByTime(1001)
  await waitFor(() => getByText('Precinct Scanner is Not Configured'))
  getByText('Insert USB Drive with configuration.')

  const kiosk = fakeKiosk()
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  window.kiosk = kiosk
  jest.advanceTimersByTime(2001)

  await waitFor(() =>
    getByText(
      'Error in configuration: No ballot package found on the inserted USB drive.'
    )
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  await advanceTimersAndPromises(2)
  await waitFor(() => getByText('Insert USB Drive with configuration.'))

  // Mock getFileSystemEntries returning an error
  kiosk.getFileSystemEntries = jest.fn().mockRejectedValueOnce('error')
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(2)
  await waitFor(() =>
    getByText(
      'Error in configuration: No ballot package found on the inserted USB drive.'
    )
  )

  // Remove the USB
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([])
  await advanceTimersAndPromises(2)
  await waitFor(() => getByText('Insert USB Drive with configuration.'))

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
    .get('./config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })

  // Reinsert USB now that fake zip file on it is setup
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(2)
  await advanceTimersAndPromises(0)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(fetchMock.calls('/config/election', { method: 'PATCH' })).toHaveLength(
    1
  )
  expect(fetchMock.calls('/scan/hmpb/addTemplates')).toHaveLength(16)
  expect(fetchMock.calls('/scan/hmpb/doneTemplates')).toHaveLength(1)

  fetchMock.delete('./config/election', {
    body: '{"status": "ok"}',
    status: 200,
  })
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

  // Remove the USB drive
  kiosk.getUsbDrives = jest.fn().mockResolvedValue([fakeUsbDrive()])
  await advanceTimersAndPromises(1)

  // Insert admin card to unconfigure
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  getByText('Administrator Settings')

  fireEvent.click(getByText('Unconfigure Machine'))
  fireEvent.click(getByText('Unconfigure'))
  getByText('Loading…')
  await waitFor(() =>
    expect(fetchMock.calls('./config/election', { method: 'DELETE' }))
  )
})

test('voter can cast a ballot that scans succesfully ', async () => {
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { status: 'ok', testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as GetScanStatusResponse)
  const { getByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

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
  await waitFor(() => getByText('Successful Scan!'))
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Scan one ballot sheet at a time.'))
  expect(getByTestId('ballot-count').textContent).toBe('1')
})

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { status: 'ok', testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as GetScanStatusResponse)
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const { getByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  )
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

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
  await waitFor(() => getByText('Overvote Warning'))
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)

  fetchMock.post('/scan/scanContinue', {
    body: { status: 'ok' },
  })

  fireEvent.click(getByText('Tabulate Ballot'))
  getByText('Tabulate Ballot with Errors?')
  fireEvent.click(getByText('Yes, Tabulate Ballot'))
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
  await waitFor(() => getByText('Successful Scan!'))
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
  await advanceTimers(5)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(getByTestId('ballot-count').textContent).toBe('1')

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
  await waitFor(() => getByText('Overvote Warning'))
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
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(fetchMock.calls('scan/scanContinue')).toHaveLength(2)
})

test('voter can cast a rejected ballot', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { status: 'ok', testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as GetScanStatusResponse)
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const { getByText } = render(<App card={card} hardware={hardware} />)
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

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
  await waitFor(() => getByText('Scanning Error'))
  getByText(
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
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
})

test('voter can cast another ballot while the success screen is showing', async () => {
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { status: 'ok', testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as GetScanStatusResponse)
  const { getByText, getByTestId } = render(
    <App card={card} hardware={hardware} />
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

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
  await waitFor(() => getByText('Successful Scan!'))
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  await advanceTimersAndPromises(1)
  expect(getByTestId('ballot-count').textContent).toBe('1')
  getByText('Successful Scan!') // Still on the success screen
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
  getByText('Overvote Warning')
  // Even after the timeout to expire the success screen occurs we stay on the review screen.
  await advanceTimersAndPromises(5)
  getByText('Overvote Warning')
  // No more ballots have scanned even though the scanner is ready for paper
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(2)
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  getByText('Administrator Settings')
  expect(getByTestId('ballot-count').textContent).toBe('1')
})
