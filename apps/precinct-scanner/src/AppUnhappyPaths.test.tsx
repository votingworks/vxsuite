import { fireEvent, render, waitFor } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  GetScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import {
  advanceTimers,
  advanceTimersAndPromises,
} from '@votingworks/test-utils'
import { AdjudicationReason } from '@votingworks/types'

import fetchMock from 'fetch-mock'
import { DateTime } from 'luxon'
import React from 'react'
import { interpretedHmpb } from '../test/fixtures'
import App from './App'
import { BallotSheetInfo } from './config/types'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import { adminCardForElection } from '../test/helpers/smartcards'

beforeEach(() => {
  jest.useFakeTimers()
  fetchMock.reset()
})

test('when module scan doesnt respond shows loading screen', async () => {
  fetchMock.get('/config/election', { status: 404 })

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const { getByText } = render(<App card={card} hardware={hardware} />)
  await waitFor(() => getByText('Loading Configuration…'))
})

test('module-scan fails to unconfigure', async () => {
  fetchMock.getOnce('/config/election', electionSampleDefinition)
  fetchMock.getOnce('/config/testMode', { status: 'ok', testMode: true })
  fetchMock.deleteOnce('/config/election', { status: 404 })

  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const { getByText } = render(<App card={card} hardware={hardware} />)
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  getByText('Administrator Settings')

  fireEvent.click(getByText('Unconfigure Machine'))
  fireEvent.click(getByText('Unconfigure'))
  getByText('Loading…')
})

test('error from module-scan in accepting a reviewable ballot', async () => {
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
  const { getByText } = render(<App card={card} hardware={hardware} />)
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
    } as GetScanStatusResponse,
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
})

test('error from module-scan in ejecting a reviewable ballot', async () => {
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
  const { getByText } = render(<App card={card} hardware={hardware} />)
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
    body: { status: 'error' },
  })
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
      adjudication: { adjudicated: 0, remaining: 1 },
    } as GetScanStatusResponse,
    { overwriteRoutes: true }
  )
  await advanceTimersAndPromises(1)
  await waitFor(() => getByText('Insert Your Ballot Below'))
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
})
