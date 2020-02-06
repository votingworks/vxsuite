import * as React from 'react'
import { render } from '@testing-library/react'

import App from './App'

import { advanceTimersAndPromises } from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'

import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'
import fakeKiosk from '../test/helpers/fakeKiosk'
import { QUIT_KIOSK_IDLE_SECONDS } from './config/globals'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
  window.kiosk = fakeKiosk()
})

afterEach(() => {
  window.kiosk = undefined
})

test('Insert Card screen idle timeout to quit app', async () => {
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineConfig = fakeMachineConfigProvider({
    // machineId determines whether we quit on idle or not
    machineId: '0001',
  })

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { getByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineConfig={machineConfig}
    />
  )

  await advanceTimersAndPromises()

  // Ensure we're on the Insert Card screen
  getByText('Insert voter card to load ballot.')
  expect(window.kiosk?.quit).not.toHaveBeenCalled()

  // Check that we requested a quit after the idle timer fired.
  await advanceTimersAndPromises(QUIT_KIOSK_IDLE_SECONDS)
  expect(window.kiosk?.quit).toHaveBeenCalledTimes(1)
})
