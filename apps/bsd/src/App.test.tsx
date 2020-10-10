import fetchMock from 'fetch-mock'
import React from 'react'
import {
  render,
  waitFor,
  RenderResult,
  fireEvent,
} from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { electionSample } from '@votingworks/ballot-encoder'
import App from './App'

const sleep = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  fetchMock.get('/config', {})
  fetchMock.get('/scan/status', {
    batches: [],
    adjudication: { adjudicated: 0, remaining: 0 },
  })

  const oldWindowLocation = window.location
  delete window.location
  window.location = {
    ...oldWindowLocation,
    href: '/',
  }
})

test('renders without crashing', async () => {
  await act(async () => {
    render(<App />)
    await waitFor(() => fetchMock.called)
  })
})

test('shows a "Test mode" button if the app is in Live Mode', async () => {
  fetchMock.getOnce(
    '/config',
    { testMode: false, election: electionSample },
    { overwriteRoutes: true }
  )

  let result!: RenderResult

  await act(async () => {
    result = render(<App />)
    await waitFor(() => fetchMock.called)
  })

  fireEvent.click(result.getByText!('Advanced'))

  result.getByText('Toggle to Test Mode')
})

test('shows a "Live mode" button if the app is in Test Mode', async () => {
  fetchMock.getOnce(
    '/config',
    { testMode: true, election: electionSample },
    { overwriteRoutes: true }
  )

  let result!: RenderResult

  await act(async () => {
    result = render(<App />)
    await waitFor(() => fetchMock.called)
  })

  fireEvent.click(result.getByText!('Advanced'))

  result.getByText('Toggle to Live Mode')
})

test('clicking Scan Batch will scan a batch', async () => {
  fetchMock.getOnce(
    '/config',
    { testMode: true, election: electionSample },
    { overwriteRoutes: true }
  )

  fetchMock.postOnce('/scan/scanBatch', {
    body: { status: 'could not scan: interpreter not ready' },
  })

  const mockAlert = jest.fn()
  delete window.alert
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
