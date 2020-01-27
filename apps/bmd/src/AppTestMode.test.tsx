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

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Displays testing message if not live mode', () => {
  const storage = new MemoryStorage<AppStorage>()
  const machineId = fakeMachineId()
  setElectionInStorage(storage)
  setStateInStorage(storage, {
    isLiveMode: false,
  })
  const { getByText } = render(<App storage={storage} machineId={machineId} />)
  getByText('Testing Mode')
})
