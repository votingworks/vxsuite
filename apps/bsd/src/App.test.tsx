import fetchMock from 'fetch-mock'
import React from 'react'
import { render, waitFor, RenderResult } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import { electionSample } from '@votingworks/ballot-encoder'
import App from './App'

beforeEach(() => {
  fetchMock.get('/config', {})
  fetchMock.get('/scan/status', { batches: [] })
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

  await act(async () => {
    render(<App />)
    await waitFor(() => fetchMock.called)
  })
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

  result.getByText('Live mode…')
})
