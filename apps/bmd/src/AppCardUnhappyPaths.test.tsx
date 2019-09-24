import React from 'react'
import { render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

// import { CARD_EXPIRATION_SECONDS } from './config/globals'
import {
  advanceTimers,
  getExpiredVoterCard,
  getVoidedVoterCard,
  noCard,
} from '../test/helpers/smartcards'

import {
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

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

  const { getByText } = render(<App />)

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
})
