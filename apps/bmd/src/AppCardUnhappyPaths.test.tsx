import React from 'react'
import { render, wait, fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

// import { CARD_EXPIRATION_SECONDS } from './config/globals'
import {
  advanceTimers,
  getExpiredVoterCard,
  getVoidedVoterCard,
  noCard,
  createVoterCard,
} from '../test/helpers/smartcards'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'
import utcTimestamp from './utils/utcTimestamp'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))
fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

fetchMock.get('/printer/status', () => ({
  ok: true,
}))

fetchMock.post('/printer/jobs/new', () => ({
  id: 'printer-job-id',
}))

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('VxMark+Print end-to-end flow', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage()

  const { getAllByText, getByText } = render(<App />)

  // ====================== END CONTEST SETUP ====================== //

  // Insert used Voter card
  currentCard = getVoidedVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert expired Voter card
  currentCard = getExpiredVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = createVoterCard({
    c: utcTimestamp() - 5 * 60, // Created 5 minutes ago
  })

  // First Insert is Good
  currentCard = expiringCard
  advanceTimers()
  await wait(() => fireEvent.click(getAllByText('Start Voting')[1]))

  // Slow voter clicks around, expiration Time passes, card still works.
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))

  // 10 minutes passes since card created. Card still works.
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))
  advanceTimers(60)
  await wait(() => fireEvent.click(getByText('Next →')))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Reinsert expired card
  currentCard = getExpiredVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove Card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------
})
