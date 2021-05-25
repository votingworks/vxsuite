import fetchMock from 'fetch-mock'
import React from 'react'
import {
  render,
  waitFor,
  RenderResult,
  fireEvent,
  screen,
} from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { electionSample, electionSampleDefinition } from '@votingworks/fixtures'
import fileDownload from 'js-file-download'
import { fakeKiosk } from '@votingworks/test-utils'
import { sleep } from '@votingworks/utils'
import {
  GetElectionConfigResponse,
  GetMarkThresholdOverridesConfigResponse,
  GetScanStatusResponse,
  GetTestModeConfigResponse,
  ScanBatchResponse,
  ScannerStatus,
} from '@votingworks/types/api/module-scan'
import App from './App'
import hasTextAcrossElements from '../test/util/hasTextAcrossElements'

jest.mock('js-file-download')

beforeEach(() => {
  const scanStatusResponse: GetScanStatusResponse = {
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
    scanner: ScannerStatus.Unknown,
  }
  fetchMock.get('/scan/status', scanStatusResponse)
  fetchMock.get('/machine-config', {
    machineId: '0001',
  })

  const oldWindowLocation = window.location
  Object.defineProperty(window, 'location', {
    value: {
      ...oldWindowLocation,
      href: '/',
    },
    configurable: true,
  })
})

test('renders without crashing', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })

  await act(async () => {
    render(<App />)
    await waitFor(() => fetchMock.called)
  })
})

test('shows a "Test mode" button if the app is in Live Mode', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: false,
  }
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })

  let result!: RenderResult

  await act(async () => {
    result = render(<App />)
    await waitFor(() => fetchMock.called)
  })

  fireEvent.click(result.getByText!('Advanced'))

  result.getByText('Toggle to Test Mode')
})

test('shows a "Live mode" button if the app is in Test Mode', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })

  let result!: RenderResult

  await act(async () => {
    result = render(<App />)
    await waitFor(() => fetchMock.called)
  })

  fireEvent.click(result.getByText!('Advanced'))

  result.getByText('Toggle to Live Mode')
})

test('clicking Scan Batch will scan a batch', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  const scanBatchResponseBody: ScanBatchResponse = {
    status: 'error',
    errors: [{ type: 'scan-error', message: 'interpreter not ready' }],
  }
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .postOnce('/scan/scanBatch', { body: scanBatchResponseBody })

  const mockAlert = jest.fn()
  window.alert = mockAlert

  await act(async () => {
    const { getByText } = render(<App />)
    getByText('Loading Configuration...')
    await sleep(500)
    fireEvent.click(getByText('Scan New Batch'))
  })

  expect(mockAlert).toHaveBeenCalled()
  mockAlert.mockClear()

  fetchMock.postOnce(
    '/scan/scanBatch',
    { body: { status: 'ok', batchId: 'foobar' } },
    { overwriteRoutes: true }
  )

  expect(mockAlert).not.toHaveBeenCalled()
})

test('clicking export shows modal and makes a request to export', async () => {
  const getElectionResponseBody: GetElectionConfigResponse = electionSampleDefinition
  const getTestModeResponseBody: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  const getMarkThresholdOverridesResponseBody: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  const scanStatusResponseBody: GetScanStatusResponse = {
    batches: [
      { id: 'test-batch', count: 2, startedAt: '2021-05-13T13:19:42.353Z' },
    ],
    adjudication: { adjudicated: 0, remaining: 0 },
    scanner: ScannerStatus.Unknown,
  }
  fetchMock
    .getOnce('/config/election', { body: getElectionResponseBody })
    .getOnce('/config/testMode', { body: getTestModeResponseBody })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponseBody,
    })
    .getOnce(
      '/scan/status',
      { body: scanStatusResponseBody },
      { overwriteRoutes: true }
    )
    .postOnce('/scan/export', {
      body: '',
    })

  const { getByText, queryByText, getByTestId } = render(<App />)
  const exportingModalText = 'No USB Drive Detected'

  await act(async () => {
    // wait for the config to load
    await sleep(500)

    fireEvent.click(getByText('Export'))
    await waitFor(() => getByText(exportingModalText))
    fireEvent.click(getByTestId('manual-export'))
    await waitFor(() => getByText('Download Complete'))
    fireEvent.click(getByText('Cancel'))
  })

  expect(fetchMock.called('/scan/export')).toBe(true)
  expect(queryByText(exportingModalText)).toBe(null)
  expect(fileDownload).toHaveBeenCalled()
})

test('configuring election from usb ballot package works end to end', async () => {
  const getTestModeConfigResponse: GetTestModeConfigResponse = {
    status: 'ok',
    testMode: true,
  }
  const getMarkThresholdOverridesResponse: GetMarkThresholdOverridesConfigResponse = {
    status: 'ok',
  }
  fetchMock
    .getOnce('/config/election', new Response('null'))
    .getOnce('/config/testMode', { body: getTestModeConfigResponse })
    .getOnce('/config/markThresholdOverrides', {
      body: getMarkThresholdOverridesResponse,
    })
    .patchOnce('/config/testMode', {
      body: '{"status": "ok"}',
      status: 200,
    })
    .patchOnce('/config/election', {
      body: '{"status": "ok"}',
      status: 200,
    })

  const { getByText, getByTestId } = render(<App />)

  const mockKiosk = fakeKiosk()
  window.kiosk = mockKiosk

  await act(async () => {
    // wait for the config to load
    await sleep(500)
    getByText('Load Election Configuration')
  })

  fetchMock
    .getOnce('/config/election', electionSampleDefinition, {
      overwriteRoutes: true,
    })
    .getOnce('/config/testMode', { testMode: true }, { overwriteRoutes: true })

  fireEvent.change(getByTestId('manual-upload-input'), {
    target: {
      files: [new File([JSON.stringify(electionSample)], 'file.json')],
    },
  })

  await act(async () => {
    await sleep(500)
    getByText('Ballot Scanner Configured')
  })

  fireEvent.click(getByText('Close'))
  getByText('No ballots have been scanned.')

  getByText('General Election')
  getByText(/Franklin County, State of Hamilton/)
  screen.getByText(hasTextAcrossElements('Scanner ID: 0001'))
})
