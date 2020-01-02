import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { advanceTimers, getNewVoterCard } from '../test/helpers/smartcards'

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

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

const idleScreenCopy =
  'This voting station has been inactive for more than 5 minutes.'

describe('Mark Card Void when voter is idle too long', () => {
  it('Display expired card if card marked as voided', async () => {
    const storage = new MemoryStorage<AppStorage>()
    const card = new MemoryCard()

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText, queryByText } = render(
      <App storage={storage} card={card} />
    )

    // Insert Voter card
    card.insertCard(getNewVoterCard())
    advanceTimers()
    await wait(() => getByText(/Center Springfield/))

    // Elapse idle timeout
    advanceTimers(IDLE_TIMEOUT_SECONDS)

    // Idle Screen is displayed
    getByText(idleScreenCopy)

    // User action removes Idle Screen
    fireEvent.click(getByText('Yes, I’m still voting.'))
    fireEvent.mouseDown(document)
    advanceTimers()
    expect(queryByText(idleScreenCopy)).toBeFalsy()

    // Elapse idle timeout
    advanceTimers(IDLE_TIMEOUT_SECONDS)

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
    advanceTimers()
    await wait() // because flash of "insert card" screen
    advanceTimers()
    await wait(() => getByText('Expired Card'))

    // Remove card
    card.removeCard()
    advanceTimers()
    await wait(() => getByText('Insert voter card to load ballot.'))
  })

  it('Reset ballot when card write does not match card read.', async () => {
    // TODO: This is required due to `fetchMock.restore()` in `setupTests.tsx`.
    // https://github.com/votingworks/bmd/issues/714
    fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '1' }))

    const storage = new MemoryStorage<AppStorage>()
    const card = new MemoryCard()

    setElectionInStorage(storage)
    setStateInStorage(storage)

    const { getByText } = render(<App storage={storage} card={card} />)

    // Insert Voter card
    card.insertCard(getNewVoterCard())
    advanceTimers()
    await wait(() => getByText(/Center Springfield/))

    // Elapse idle timeout
    advanceTimers(IDLE_TIMEOUT_SECONDS)

    // Idle Screen is displayed
    getByText(idleScreenCopy)

    // Countdown works
    advanceTimers(IDLE_RESET_TIMEOUT_SECONDS)
    advanceTimers()
    getByText('Clearing ballot')

    card.insertCard('all your base are belong to us')

    // 30 seconds passes, Expect voided card
    advanceTimers()
    await wait() // TODO: unsure why this `wait` is needed, but it is.
    getByText('Insert Card')
  })
})
