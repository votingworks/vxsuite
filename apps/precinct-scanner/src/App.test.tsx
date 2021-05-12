import React from 'react'
import fetchMock from 'fetch-mock'
import { promises as fs } from 'fs'
import {
  ScannerStatus,
  ScanStatusResponse,
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
import App from './App'
import { BallotSheetInfo } from './config/types'
import { interpretedHmpb } from '../test/fixtures'

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

test('app can load and configure from a usb stick', async () => {
  fetchMock.getOnce('/config/election', new Response('null'))
  fetchMock.get('/config/testMode', { testMode: true })
  const { getByText } = render(<App />)
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

  /*  TODO(caro): Test unconfiguring election from admin screen when implemented

  fireEvent.click(getByText('Unconfigure'))
  await waitFor(() =>
    expect(fetchMock.calls('./config/election', { method: 'DELETE' }))
  ) */
})

test('voter can cast a ballot that scans succesfully ', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.getOnce('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as ScanStatusResponse)
  const { getByText, getByTestId } = render(<App />)
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok' },
  })
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as ScanStatusResponse,
    { overwriteRoutes: false }
  )
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        { id: 'test-batch', count: 1, startedAt: DateTime.now().toISO() },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as ScanStatusResponse,
    { overwriteRoutes: false }
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
  fetchMock.postOnce('/scan/scanContinue', {
    status: 'ok',
  })
  await advanceTimersAndPromises(1)
  fetchMock.getOnce(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [
        { id: 'test-batch', count: 1, startedAt: DateTime.now().toISO() },
      ],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as ScanStatusResponse,
    { overwriteRoutes: false }
  )
  await waitFor(() => getByText('Successful Scan!'))
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(1)
  await advanceTimersAndPromises(5)
  await waitFor(() => getByText('Scan one ballot sheet at a time.'))
  expect(getByTestId('ballot-count').textContent).toBe('1')
})

test('voter can cast a ballot that needs review and adjudicate as desired', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
  })
  const { getByText, getByTestId } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  fetchMock.post('/scan/scanSingle', {
    body: { status: 'RequiresAdjudication' },
  })
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Overvote Warning'))
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(1)

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
      batches: [{ count: 1 }],
    },
    { overwriteRoutes: true }
  )
  await waitFor(() => getByText('Successful Scan!'))
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
  await advanceTimers(5)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(getByTestId('ballot-count').textContent).toBe('1')

  // Simulate another ballot
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true, repeat: 1 }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Overvote Warning'))
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(2)

  // Simulate voter pulling out the ballot
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
})

test('voter can cast a rejected ballot', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
  })
  const { getByText } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true, repeat: 1 }
  )
  fetchMock.post('/scan/scanSingle', {
    body: { status: 'something' },
  })
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Scanning Error'))
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(1)

  // When the voter removes the ballot return to the insert ballot screen
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  getByText('Insert Your Ballot Below')
})

test('voter can cast another ballot while the success screen is showing', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
  })
  const { getByText } = render(<App />)
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  getByText('Scan one ballot sheet at a time.')
  getByText('General Election')
  getByText(/Franklin County/)
  getByText(/State of Hamilton/)
  getByText('Election ID')
  getByText('2f6b1553c7')

  fetchMock.post(
    '/scan/scanSingle',
    {
      body: { status: 'ok' },
    },
    { repeat: 1 }
  )
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Successful Scan!'))
  fetchMock.post(
    '/scan/scanSingle',
    {
      body: { status: 'RequiresAdjudication' },
    },
    { overwriteRoutes: true, repeat: 1 }
  )
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(1)
  await advanceTimersAndPromises(1)
  await waitFor(() =>
    expect(fetchMock.calls('scan/scanSingle')).toHaveLength(2)
  )
  getByText('Overvote Warning')
  // Even after the timeout to expire the success screen occurs we stay on the review screen.
  await advanceTimersAndPromises(5)
  getByText('Overvote Warning')
  // No more ballots have scanned even though the scanner is ready for paper
  expect(fetchMock.calls('scan/scanSingle')).toHaveLength(2)
})
