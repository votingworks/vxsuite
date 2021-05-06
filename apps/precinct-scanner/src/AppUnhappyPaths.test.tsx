import { fireEvent, render, screen } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import {
  advanceTimers,
  advanceTimersAndPromises,
} from '@votingworks/test-utils'
import { AdjudicationReason } from '@votingworks/types'
import {
  GetCurrentPrecinctConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import fetchMock from 'fetch-mock'
import { DateTime } from 'luxon'
import React from 'react'
import { interpretedHmpb } from '../test/fixtures'
import {
  adminCardForElection,
  pollWorkerCardForElection,
  getVoterCard,
} from '../test/helpers/smartcards'
import App from './App'
import { BallotSheetInfo } from './config/types'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import { MemoryStorage } from './utils/Storage'
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
  const hardware = MemoryHardware.standard
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
  const hardware = MemoryHardware.standard
  render(<App card={card} hardware={hardware} />)
  const adminCard = adminCardForElection(electionSampleDefinition.electionHash)
  card.insertCard(adminCard, JSON.stringify(electionSampleDefinition))
  await advanceTimersAndPromises(1)
  await screen.findByText('Administrator Settings')

  fireEvent.click(await screen.findByText('Unconfigure Machine'))
  fireEvent.click(await screen.findByText('Unconfigure'))

  await screen.findByText('Loading')
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
  const hardware = MemoryHardware.standard
  render(<App card={card} hardware={hardware} />)
  await screen.findByText('Polls Closed')
  const voterCard = getVoterCard()
  card.insertCard(voterCard)
  await advanceTimersAndPromises(1)
  await screen.findByText('Invalid Card, please remove.')

  card.removeCard()
  await advanceTimersAndPromises(1)
  await screen.findByText('Polls Closed')

  const pollWorkerCardWrongElection = pollWorkerCardForElection(
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
    { body: scanStatusReadyToScanResponseBody },
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
  await screen.findByText('Ballot Requires Review')
  expect(fetchMock.calls('scan/scanBatch')).toHaveLength(1)
  fetchMock.post('/scan/scanContinue', {
    body: { status: 'error' },
  })

  fireEvent.click(await screen.findByText('Tabulate Ballot'))
  fireEvent.click(await screen.findByText('Yes, Tabulate Ballot'))
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
  await screen.findByText('Ballot Requires Review')
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
  await screen.findByText('Insert Your Ballot Below')
  expect(fetchMock.calls('/scan/scanContinue')).toHaveLength(1)
})
