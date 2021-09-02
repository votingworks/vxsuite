import { render, screen } from '@testing-library/react'
import {
  GetScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import { sleep } from '@votingworks/utils'
import React from 'react'
import fetchMock, { MockResponseFunction } from 'fetch-mock'
import { advanceTimersAndPromises } from '@votingworks/test-utils'
import usePrecinctScanner from './usePrecinctScanner'

const scanStatusWaitingForPaperResponse: GetScanStatusResponse = {
  adjudication: { adjudicated: 0, remaining: 0 },
  batches: [],
  scanner: ScannerStatus.WaitingForPaper,
}

const scanStatusReadyToScanResponse: GetScanStatusResponse = {
  adjudication: { adjudicated: 0, remaining: 0 },
  batches: [],
  scanner: ScannerStatus.ReadyToScan,
}

const TestComponent: React.FC<{ interval?: number | false }> = ({
  interval = 1,
} = {}) => (
  <React.Fragment>
    {usePrecinctScanner(interval)?.status.scannerState ?? 'none'}
  </React.Fragment>
)

beforeEach(() => {
  jest.useFakeTimers()
})

test('initial state', async () => {
  render(<TestComponent />)
  screen.getByText('none')
})

test('updates from /scan/status', async () => {
  render(<TestComponent />)

  // first update
  fetchMock.getOnce('/scan/status', { body: scanStatusWaitingForPaperResponse })
  await advanceTimersAndPromises(1)
  screen.getByText(ScannerStatus.WaitingForPaper)

  // second update
  fetchMock.getOnce(
    '/scan/status',
    { body: scanStatusReadyToScanResponse },
    { overwriteRoutes: false }
  )
  await advanceTimersAndPromises(1)
  screen.getByText(ScannerStatus.ReadyToScan)
})

test('disabling', async () => {
  render(<TestComponent interval={false} />)

  fetchMock.getOnce('/scan/status', { body: scanStatusWaitingForPaperResponse })
  await advanceTimersAndPromises(100)

  screen.getByText('none')
})

test('issues one status check at a time', async () => {
  const statusEndpoint = jest.fn<
    ReturnType<MockResponseFunction>,
    Parameters<MockResponseFunction>
  >(async () => {
    await sleep(5)
    return new Response(JSON.stringify(scanStatusWaitingForPaperResponse), {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  render(<TestComponent />)

  fetchMock.get('/scan/status', statusEndpoint)
  screen.getByText('none')

  await advanceTimersAndPromises(6)
  screen.getByText(ScannerStatus.WaitingForPaper)

  await advanceTimersAndPromises(6)
  expect(statusEndpoint.mock.calls.length).toEqual(2)
})
