import { fireEvent, render, waitFor } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  advanceTimers,
  advanceTimersAndPromises,
} from '@votingworks/test-utils'
import { AdjudicationReason } from '@votingworks/types'
import {
  ScannerStatus,
  ScanStatusResponse,
} from '@votingworks/types/api/module-scan'
import fetchMock from 'fetch-mock'
import { DateTime } from 'luxon'
import React from 'react'
import { interpretedHmpb } from '../test/fixtures'
import App from './App'
import { BallotSheetInfo } from './config/types'

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

test('when module scan doesnt respond shows loading screen', async () => {
  fetchMock.getOnce('/config/election', { status: 404 })
  const spy = jest.spyOn(console, 'error').mockReturnValue()

  const { getByText } = render(<App />)
  await waitFor(() => getByText('Loading Configuration…'))
  expect(spy).toHaveBeenCalledWith(
    'failed to initialize:',
    new Error('fetch response is not ok')
  )
})

/* test('module-scan fails to unconfigure', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.getOnce('/config/testMode', { testMode: true })
  fetchMock.deleteOnce('/config/election', { status: 404 })
  const spy = jest.spyOn(console, 'error').mockReturnValue()

  const { getByText } = render(<App />)
  await waitFor(() => fireEvent.click(getByText('Unconfigure')))
  expect(spy).toHaveBeenCalledWith(
    'failed unconfigureServer()',
    new Error(
      'invalid json response body at /config/election reason: Unexpected end of JSON input'
    )
  )
}) */

/* test('unknown status from module-scan status shows error screen', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    scanner: 'Unknown',
  })
  const { getByText } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Scanning Error'))
}) */

/* test('error from module-scan status shows error screen', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    scanner: 'Error',
  })
  const { getByText } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Scanning Error'))
  fireEvent.click(getByText('Dismiss Error'))
  getByText('Insert Your Ballot Below')
}) */

test('error from module-scan in accepting a reviewable ballot', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: 'WaitingForPaper',
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  } as ScanStatusResponse)
  const { getByText } = render(<App />)
  advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))

  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  fetchMock.post('/scan/scanBatch', {
    body: { status: 'ok', batchId: 'test-batch' },
  })
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [
        { id: 'test-batch', count: 1, startedAt: DateTime.now().toISO() },
      ],
      adjudication: { adjudicated: 0, remaining: 1 },
    } as ScanStatusResponse,
    { overwriteRoutes: true }
  )
  fetchMock.get('/scan/hmpb/review/next-sheet', {
    id: 'test-sheet',
    front: {
      interpretation: interpretedHmpb({
        electionDefinition: electionSampleDefinition,
        pageNumber: 1,
        adjudicationReason: AdjudicationReason.Overvote,
      }),
      image: {
        url: '/not/real.jpg',
      },
    },
    back: {
      interpretation: interpretedHmpb({
        electionDefinition: electionSampleDefinition,
        pageNumber: 2,
      }),
      image: {
        url: '/not/real.jpg',
      },
    },
  } as BallotSheetInfo)
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Overvote Warning'))
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'error' },
  })

  fireEvent.click(getByText('Tabulate Ballot'))
  fireEvent.click(getByText('Yes, Tabulate Ballot'))
  await waitFor(() => getByText('Scanning Error'))
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
  await advanceTimersAndPromises(5)
  // Screen does NOT reset automatically to insert ballot screen
  getByText('Scanning Error')
  // Removing ballot resets to insert screen
  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.WaitingForPaper,
      batches: [],
      adjudication: { adjudicated: 0, remaining: 0 },
    } as ScanStatusResponse,
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
})

/* test('error from module-scan in ejecting a reviewable ballot', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: ScannerStatus.WaitingForPaper,
    batches: [],
  })
  const { getByText } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))

  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  fetchMock.post('/scan/precinct/scan', {
    body: { status: 'RequiresAdjudication' },
  })
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Ballot Requires Review'))
  fetchMock.post('/scan/precinct/reject', {
    body: { status: 'error' },
  })

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
  await waitFor(() => getByText('Scanning Error'))
  expect(fetchMock.calls('/scan/precinct/reject')).toHaveLength(1)
  await advanceTimersAndPromises(5)
  await waitFor(() => getByText('Insert Your Ballot Below'))
}) */

/* test('paper pulled out while scanning', async () => {
  fetchMock.get('/config/election', electionSampleDefinition)
  fetchMock.get('/config/testMode', { testMode: true })
  fetchMock.get('/scan/status', {
    status: 'ok',
    scanner: ScannerStatus.WaitingForPaper,
    batches: [],
  })
  const { getByText } = render(<App />)
  await advanceTimers(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))

  fetchMock.get(
    '/scan/status',
    {
      status: 'ok',
      scanner: ScannerStatus.ReadyToScan,
      batches: [],
    },
    { overwriteRoutes: true }
  )
  fetchMock.post(
    '/scan/precinct/scan',
    {
      body: { status: 'error' },
    },
    { delay: 5000 }
  )
  await advanceTimersAndPromises(1)
  getByText('Scanning')
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
  fetchMock.post('/scan/precinct/reject', {
    body: { status: 'ok' },
  })

  await waitFor(() => getByText('Scanning Error'))
  await advanceTimersAndPromises(5)
  await waitFor(() => getByText('Insert Your Ballot Below'))
}) */
