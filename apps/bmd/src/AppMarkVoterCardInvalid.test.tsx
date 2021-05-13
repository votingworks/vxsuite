import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { MemoryStorage, MemoryCard, MemoryHardware } from '@votingworks/utils'

import App from './App'

import {
  advanceTimers,
  advanceTimersAndPromises,
  getNewVoterCard,
} from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import {
  IDLE_TIMEOUT_SECONDS,
  IDLE_RESET_TIMEOUT_SECONDS,
} from './config/globals'
import { fakeMachineConfigProvider } from '../test/helpers/fakeMachineConfig'

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()

const idleScreenCopy =
  'This voting station has been inactive for more than 5 minutes.'

describe('Mark Card Void when voter is idle too long', () => {
  test('Display expired card if card marked as voided', async () => {
    const card = new MemoryCard()
    const hardware = await MemoryHardware.buildStandard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()

    await setElectionInStorage(storage)
    await setStateInStorage(storage)

    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )
    // Initialize app
    await advanceTimersAndPromises()

    // Insert Voter card
    card.insertCard(getNewVoterCard())
    await advanceTimersAndPromises()
    getByText(/Center Springfield/)
    getByText('Start Voting')

    // Elapse idle timeout
    await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS)

    // Idle Screen is displayed
    getByText(idleScreenCopy)

    // User action removes Idle Screen
    fireEvent.click(getByText('Yes, I’m still voting.'))
    fireEvent.mouseDown(document)
    await advanceTimersAndPromises()
    expect(queryByText(idleScreenCopy)).toBeFalsy()

    // Elapse idle timeout
    await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS)

    // Idle Screen is displayed
    getByText(idleScreenCopy)

    // Countdown works
    const secondsRemaining = 20
    advanceTimers(IDLE_RESET_TIMEOUT_SECONDS - secondsRemaining)
    getByText(`${secondsRemaining} seconds`)

    advanceTimers(secondsRemaining)
    getByText('Clearing ballot')

    // Idle reset timeout expires
    await advanceTimersAndPromises()

    // Insert Card screen displays while card is read again.
    getByText('Insert Card')

    // Card read again and now displays expired msg.
    await advanceTimersAndPromises()
    getByText('Expired Card')

    // Remove card
    card.removeCard()
    await advanceTimersAndPromises()
    getByText('Insert voter card to load ballot.')
  })

  test('Reset ballot when card write does not match card read.', async () => {
    const card = new MemoryCard()
    const hardware = await MemoryHardware.buildStandard()
    const storage = new MemoryStorage()
    const machineConfig = fakeMachineConfigProvider()

    await setElectionInStorage(storage)
    await setStateInStorage(storage)

    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineConfig={machineConfig}
      />
    )
    // Initialize app
    await advanceTimersAndPromises()

    // Insert Voter card
    card.insertCard(getNewVoterCard())
    await advanceTimersAndPromises()
    getByText(/Center Springfield/)

    // Elapse idle timeout
    await advanceTimersAndPromises(IDLE_TIMEOUT_SECONDS)

    // Idle Screen is displayed
    getByText(idleScreenCopy)

    // Countdown works
    advanceTimers(IDLE_RESET_TIMEOUT_SECONDS)
    getByText('Clearing ballot')

    // Insert Card with corrupted data.
    card.insertCard('{"all": "your base are belong to us"}')

    // 30 seconds passes, Expect voided card
    await advanceTimersAndPromises()
    getByText('Insert Card')
  })
})
