import React from 'react'
import { render, wait } from '@testing-library/react'

import App from './App'
import SampleApp, { getSampleStorage } from './SampleApp'
import { activationStorageKey, electionStorageKey, AppStorage } from './AppRoot'

import {
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { advanceTimers } from '../test/helpers/smartcards'
import { MemoryStorage } from './utils/Storage'
import fakeMachineId from '../test/helpers/fakeMachineId'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

describe('loads election', () => {
  it('Machine is not configured by default', () => {
    const { getByText } = render(<App machineId={fakeMachineId()} />)
    getByText('Device Not Configured')
  })

  it('from storage', () => {
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText } = render(
      <App storage={storage} machineId={machineId} />
    )
    getByText(election.title)
    expect(storage.get(electionStorageKey)).toBeTruthy()
  })

  it('sample app loads election and activates ballot', async () => {
    const storage = getSampleStorage()
    const { getAllByText, getByText } = render(<SampleApp storage={storage} />)
    advanceTimers()
    await wait(() => {
      expect(getAllByText(election.title).length).toBeGreaterThan(1)
      getByText(/Center Springfield/)
      getByText(/ballot style 12/)
    })
    expect(storage.get(electionStorageKey)).toBeTruthy()
    expect(storage.get(activationStorageKey)).toBeTruthy()
  })
})
