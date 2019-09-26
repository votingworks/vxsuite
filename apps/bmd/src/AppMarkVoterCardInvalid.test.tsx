import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  advanceTimers,
  getNewVoterCard,
  noCard,
} from '../test/helpers/smartcards'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'
import {
  IDLE_TIMEOUT_SECONDS,
  IDLE_RESET_TIMEOUT_SECONDS,
} from './config/globals'

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

const idleScreenCopy =
  'This voting station has been inactive for more than 5 minutes.'

describe('Mark Card Void when voter is idle too long', () => {
  it('Display expired card if card marked as voided', async () => {
    let currentCard = noCard
    fetchMock.get('/card/read', () => JSON.stringify(currentCard))

    fetchMock.post('/card/write', (url, options) => {
      currentCard = {
        present: true,
        shortValue: options.body as string,
      }
      return ''
    })

    setElectionInLocalStorage()
    setStateInLocalStorage()

    const { getByText, queryByText } = render(<App />)

    // Insert Voter card
    currentCard = getNewVoterCard()
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
    currentCard = noCard
    advanceTimers()
    await wait(() => getByText('Insert voter card to load ballot.'))
  })

  it('Reset ballot when card write does not match card read.', async () => {
    // TODO: This is required due to `fetchMock.restore()` in `setupTests.tsx`.
    // https://github.com/votingworks/bmd/issues/714
    fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '1' }))

    let currentCard = noCard
    fetchMock.get('/card/read', () => JSON.stringify(currentCard))

    fetchMock.post('/card/write', (url, options) => {
      currentCard = {
        present: true,
        shortValue: options.body as string,
      }
      return ''
    })

    setElectionInLocalStorage()
    setStateInLocalStorage()

    const { getByText } = render(<App />)

    // Insert Voter card
    currentCard = getNewVoterCard()
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

    const unmatchedCardData = {
      ...currentCard,
      shortValue: JSON.stringify('all your base are belong to us'),
    }
    fetchMock.get('/card/read', () => JSON.stringify(unmatchedCardData), {
      overwriteRoutes: true,
    })

    // 30 seconds passes, Expect voided card
    advanceTimers()
    await wait()
    getByText('Insert Card')
  })
})
