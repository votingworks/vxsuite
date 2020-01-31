import React from 'react'
import { render } from '@testing-library/react'

import App from './App'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import fakeMachineId from '../test/helpers/fakeMachineId'
import { advanceTimersAndPromises } from '../test/helpers/smartcards'
import { MemoryHardware } from './utils/Hardware'
import { MemoryCard } from './utils/Card'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Displays testing message if not live mode', async () => {
  const card = new MemoryCard()
  const storage = new MemoryStorage<AppStorage>()
  const machineId = fakeMachineId()
  setElectionInStorage(storage)
  setStateInStorage(storage, {
    isLiveMode: false,
  })
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

  getByText('Testing Mode')
})
