import { act, render, screen } from '@testing-library/react'
import {
  GetScanStatusResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import React from 'react'
import fetchMock, { MockResponseFunction } from 'fetch-mock'
import usePrecinctScannerStatus from './usePrecinctScannerStatus'

async function sleep(duration: number) {
  await new Promise((resolve) => setTimeout(resolve, duration))
}

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

test('initial state', async () => {
  const Component: React.FC = () => {
    return <React.Fragment>{usePrecinctScannerStatus()}</React.Fragment>
  }

  render(<Component />)
  await screen.findByText(ScannerStatus.Unknown)
})

test('updates from /scan/status', async () => {
  const Component: React.FC = () => {
    return <React.Fragment>{usePrecinctScannerStatus(1)}</React.Fragment>
  }

  // first update
  fetchMock.getOnce('/scan/status', { body: scanStatusWaitingForPaperResponse })
  render(<Component />)
  await screen.findByText(ScannerStatus.WaitingForPaper)

  // second update
  fetchMock.getOnce(
    '/scan/status',
    { body: scanStatusReadyToScanResponse },
    { overwriteRoutes: false }
  )
  await screen.findByText(ScannerStatus.ReadyToScan)
})

test('disabling', async () => {
  const Component: React.FC = () => {
    return <React.Fragment>{usePrecinctScannerStatus(false)}</React.Fragment>
  }

  fetchMock.getOnce('/scan/status', { body: scanStatusWaitingForPaperResponse })

  render(<Component />)
  await screen.findByText(ScannerStatus.Unknown)
})

test('issues one status check at a time', async () => {
  const Component: React.FC = () => {
    return <React.Fragment>{usePrecinctScannerStatus(1)}</React.Fragment>
  }

  const statusEndpoint = jest.fn<
    ReturnType<MockResponseFunction>,
    Parameters<MockResponseFunction>
  >(async () => {
    await sleep(5)
    return new Response(JSON.stringify(scanStatusWaitingForPaperResponse), {
      headers: { 'Content-Type': 'application/json' },
    })
  })

  fetchMock.get('/scan/status', statusEndpoint)

  render(<Component />)
  await screen.findByText(ScannerStatus.Unknown)
  await act(() => sleep(5))
  await screen.findByText(ScannerStatus.WaitingForPaper)
  expect(statusEndpoint.mock.calls.length).toBeLessThanOrEqual(2)
})
