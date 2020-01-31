import React from 'react'
import { render } from '@testing-library/react'

import App from './App'
import SampleApp, { getSampleStorage } from './SampleApp'
import { activationStorageKey, electionStorageKey, AppStorage } from './AppRoot'

import {
  election,
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { advanceTimersAndPromises } from '../test/helpers/smartcards'
import { MemoryStorage } from './utils/Storage'
import fakeMachineId from '../test/helpers/fakeMachineId'
import { MemoryHardware } from './utils/Hardware'
import { MemoryCard } from './utils/Card'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

describe('loads election', () => {
  it('Machine is not configured by default', async () => {
    const { getByText } = render(
      <App
        machineId={fakeMachineId()}
        card={new MemoryCard()}
        hardware={MemoryHardware.standard}
      />
    )

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    getByText('Device Not Configured')
  })

  it('from storage', async () => {
    const card = new MemoryCard()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()
    setElectionInStorage(storage)
    setStateInStorage(storage)
    const { getByText } = render(
      <App
        card={card}
        storage={storage}
        machineId={machineId}
        hardware={MemoryHardware.standard}
      />
    )

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    getByText(election.title)
    expect(storage.get(electionStorageKey)).toBeTruthy()
  })

  it('sample app loads election and activates ballot', async () => {
    const storage = getSampleStorage()
    const { getAllByText, getByText } = render(<SampleApp storage={storage} />)

    // Let the initial hardware detection run.
    await advanceTimersAndPromises()

    expect(getAllByText(election.title).length).toBeGreaterThan(1)
    getByText(/Center Springfield/)
    getByText(/ballot style 12/)
    expect(storage.get(electionStorageKey)).toBeTruthy()
    expect(storage.get(activationStorageKey)).toBeTruthy()
  })
})
