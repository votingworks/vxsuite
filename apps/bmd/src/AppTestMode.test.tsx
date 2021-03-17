import React from 'react'
import { render } from '@testing-library/react'

import App from './App'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { MemoryStorage } from './utils/Storage'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import { advanceTimersAndPromises } from '../test/helpers/smartcards'
import { MemoryHardware } from './utils/Hardware'
import { MemoryCard } from './utils/Card'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Displays testing message if not live mode', async () => {
  const card = new MemoryCard()
  const storage = new MemoryStorage()
  const machineConfig = fakeMachineConfigProvider()
  setElectionInStorage(storage)
  setStateInStorage(storage, {
    isLiveMode: false,
  })
  const { getByText } = render(
    <App
      card={card}
      storage={storage}
      machineConfig={machineConfig}
      hardware={MemoryHardware.standard}
    />
  )

  // Let the initial hardware detection run.
  await advanceTimersAndPromises()

  getByText('Testing Mode')
})
