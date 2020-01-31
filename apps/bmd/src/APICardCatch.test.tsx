import React from 'react'
import { fireEvent, render } from '@testing-library/react'

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
import fakeMachineId from '../test/helpers/fakeMachineId'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Cause "/card/read" API to catch', async () => {
  // Configure Machine
  const card = new MemoryCard()
  const hardware = MemoryHardware.standard
  const storage = new MemoryStorage<AppStorage>()
  const machineId = fakeMachineId()
  setElectionInStorage(storage)
  setStateInStorage(storage)

  // Mock Failed response
  const readStatusMock = jest
    .spyOn(card, 'readStatus')
    .mockImplementation(() => {
      throw new Error('NOPE')
    })
  const { getByText } = render(
    <App
      card={card}
      hardware={hardware}
      storage={storage}
      machineId={machineId}
    />
  )

  // Ensure card polling interval time is passed
  await advanceTimersAndPromises()

  // Wait for component to render
  fireEvent.click(getByText('Insert Card'))

  // Expect that card API was called once
  expect(readStatusMock).toHaveBeenCalledTimes(1)

  // Ensure card polling interval time is passed again
  await advanceTimersAndPromises()

  // Expect that card API has not been called again
  expect(readStatusMock).toHaveBeenCalledTimes(1)
})
