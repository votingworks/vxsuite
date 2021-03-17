import React from 'react'
import { render } from '@testing-library/react'

import fetchMock from 'fetch-mock'
import App from './App'

import { MemoryStorage } from './utils/Storage'
import { VxMarkOnly, MachineConfigResponse } from './config/types'

beforeEach(() => {
  window.location.href = '/'
})

test('machineConfig is fetched from /machine-config by default', async () => {
  const machineConfigResponse: MachineConfigResponse = {
    appModeName: VxMarkOnly.name,
    machineId: '99',
  }

  fetchMock.get('/machine-config', () => JSON.stringify(machineConfigResponse))

  render(<App storage={new MemoryStorage()} />)

  expect(fetchMock.called('/machine-config')).toBe(true)
})

test('machineConfig fetch fails', async () => {
  const machineConfig = {
    get: () => Promise.reject(new Error('fetch failed!')),
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `catch` block of `setMachineConfig`
})

test('machineId is empty', async () => {
  const machineConfig = {
    async get() {
      return { appMode: VxMarkOnly, machineId: '' }
    },
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
})

test('machineConfig is empty', async () => {
  const machineConfig = {
    async get() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return undefined as any
    },
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
})
