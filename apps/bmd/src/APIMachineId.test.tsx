import React from 'react'
import { render } from '@testing-library/react'

import fetchMock from 'fetch-mock'
import App from './App'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'

beforeEach(() => {
  window.location.href = '/'
})

test('machineId is fetched from /machine-id by default', async () => {
  fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '99' }))

  render(<App storage={new MemoryStorage<AppStorage>()} />)

  expect(fetchMock.called('/machine-id')).toBe(true)
})

test('machineId fetch fails', async () => {
  const machineId = { get: () => Promise.reject(new Error('fetch failed!')) }

  // Render app which gets machineId in componentDidMount
  render(
    <App storage={new MemoryStorage<AppStorage>()} machineId={machineId} />
  )

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `catch` block of `setMachineId`
})

test('machineId is empty', async () => {
  const machineId = {
    async get() {
      return ''
    },
  }

  // Render app which gets machineId in componentDidMount
  render(
    <App storage={new MemoryStorage<AppStorage>()} machineId={machineId} />
  )

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineId`
})
