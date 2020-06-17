import fetchMock from 'fetch-mock'
import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { act } from 'react-dom/test-utils'
import App from './App'

beforeEach(() => {
  fetchMock.get('/config', {})
  fetchMock.get('/scan/status', { batches: [] })
})

it('renders without crashing', async () => {
  await act(async () => {
    render(<App />)
    await waitFor(() => fetchMock.called)
  })
})
