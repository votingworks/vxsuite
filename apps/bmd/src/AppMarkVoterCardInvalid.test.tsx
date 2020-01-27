import React from 'react'
import { fireEvent, render } from '@testing-library/react'

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
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'
import { MemoryCard } from './utils/Card'
import { MemoryHardware } from './utils/Hardware'
import fakeMachineId from '../test/helpers/fakeMachineId'

beforeEach(() => {
  window.location.href = '/'
})

jest.useFakeTimers()

const idleScreenCopy =
  'This voting station has been inactive for more than 5 minutes.'

describe('Mark Card Void when voter is idle too long', () => {
  it('Display expired card if card marked as voided', async () => {
    const card = new MemoryCard()
    const hardware = new MemoryHardware()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText, queryByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

    // Insert Voter card
    card.insertCard(getNewVoterCard())
    await advanceTimersAndPromises()
    getByText(/Center Springfield/)

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
    advanceTimers()
    getByText('Clearing ballot')

    // Idle reset timeout passes, Expect voided card
    await advanceTimersAndPromises() // because flash of "insert card" screen
    await advanceTimersAndPromises()
    getByText('Expired Card')

    // Remove card
    card.removeCard()
    await advanceTimersAndPromises()
    getByText('Insert voter card to load ballot.')
  })

  it('Reset ballot when card write does not match card read.', async () => {
    const card = new MemoryCard()
    const hardware = new MemoryHardware()
    const storage = new MemoryStorage<AppStorage>()
    const machineId = fakeMachineId()

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText } = render(
      <App
        card={card}
        hardware={hardware}
        storage={storage}
        machineId={machineId}
      />
    )

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

    card.insertCard('all your base are belong to us')

    // 30 seconds passes, Expect voided card
    await advanceTimersAndPromises()
    getByText('Insert Card')
  })
})
