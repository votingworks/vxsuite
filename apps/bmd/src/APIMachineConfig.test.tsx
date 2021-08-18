import React from 'react'
import { render } from '@testing-library/react'

import fetchMock from 'fetch-mock'
import { Provider } from '@votingworks/types'
import { MemoryStorage, typedAs } from '@votingworks/utils'
import App from './App'

import {
  VxMarkOnly,
  MachineConfigResponse,
  MachineConfig,
} from './config/types'
import { advanceTimersAndPromises } from '../test/helpers/smartcards'

beforeEach(() => {
  jest.useFakeTimers()
  window.location.href = '/'
})

test('machineConfig is fetched from /machine-config by default', async () => {
  fetchMock.get(
    '/machine-config',
    typedAs<MachineConfigResponse>({
      appModeName: VxMarkOnly.name,
      machineId: '99',
      codeVersion: 'test',
    })
  )

  render(<App storage={new MemoryStorage()} />)
  await advanceTimersAndPromises()

  expect(fetchMock.called('/machine-config')).toBe(true)
})

test('machineConfig fetch fails', async () => {
  const machineConfig: Provider<MachineConfig> = {
    get: () => Promise.reject(new Error('fetch failed!')),
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)
  await advanceTimersAndPromises()

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `catch` block of `setMachineConfig`
})

test('machineId is empty', async () => {
  const machineConfig: Provider<MachineConfig> = {
    async get() {
      return { appMode: VxMarkOnly, machineId: '', codeVersion: 'test' }
    },
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)
  await advanceTimersAndPromises()

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
})

test('machineConfig is empty', async () => {
  const machineConfig: Provider<MachineConfig> = {
    async get() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return undefined as any
    },
  }

  // Render app which gets machineConfig in componentDidMount
  render(<App storage={new MemoryStorage()} machineConfig={machineConfig} />)
  await advanceTimersAndPromises()

  // No expect?
  // Unfortunately, the only thing this test does is provide code-coverage
  // for the `else` block of `setMachineConfig`
})
