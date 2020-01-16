import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'

import App from './App'

import { advanceTimers } from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('Cause "/card/read" API to catch', async () => {
  // Configure Machine
  const card = new MemoryCard()
  const hardware = new MemoryHardware()
  const storage = new MemoryStorage<AppStorage>()
  setElectionInStorage(storage)
  setStateInStorage(storage)

  // Mock Failed response
  const readStatusMock = jest
    .spyOn(card, 'readStatus')
    .mockImplementation(() => {
      throw new Error('NOPE')
    })
  const { getByText } = render(
    <App card={card} hardware={hardware} storage={storage} />
  )

  // Ensure card polling interval time is passed
  advanceTimers()

  // Wait for component to render
  await wait(() => fireEvent.click(getByText('Insert Card')))

  // Expect that card API was called once
  expect(readStatusMock).toHaveBeenCalledTimes(1)

  // Ensure card polling interval time is passed again
  advanceTimers()

  // Expect that card API has not been called again
  expect(readStatusMock).toHaveBeenCalledTimes(1)
})
