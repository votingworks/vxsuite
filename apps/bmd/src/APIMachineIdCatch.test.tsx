import React from 'react'
import { render } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Cause "/machine-id" API to catch`, async () => {
  // Mock Failed response
  fetchMock.get('/machine-id', () => undefined, { overwriteRoutes: true })

  // Render app which calls machineId api in componentDidMount
  render(<App />)

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `catch` block of the fetch to /machine-id
})
