import React from 'react'
import { render, wait, fireEvent } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { CARD_EXPIRATION_SECONDS } from './config/globals'
import {
  advanceTimers,
  getExpiredVoterCard,
  getVoidedVoterCard,
  createVoterCard,
} from '../test/helpers/smartcards'

import {
  setElectionInStorage,
  setStateInStorage,
} from '../test/helpers/election'
import utcTimestamp from './utils/utcTimestamp'
import { MemoryCard } from './utils/Card'
import { MemoryStorage } from './utils/Storage'
import { AppStorage } from './AppRoot'

fetchMock.get('/printer/status', () => ({
  ok: true,
}))

fetchMock.post('/printer/jobs/new', () => ({
  id: 'printer-job-id',
}))

jest.useFakeTimers()

beforeEach(() => {
  window.location.href = '/'
})

it('VxMark+Print end-to-end flow', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  const storage = new MemoryStorage<AppStorage>()
  const card = new MemoryCard()

  card.removeCard()

  setElectionInStorage(storage)
  setStateInStorage(storage)

  const { getByText } = render(<App storage={storage} card={card} />)

  // ====================== END CONTEST SETUP ====================== //

  // Insert used Voter card
  card.insertCard(getVoidedVoterCard())
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert expired Voter card
  card.insertCard(getExpiredVoterCard())
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Voter Card which eventually expires
  const expiringCard = createVoterCard({
    c: utcTimestamp() - CARD_EXPIRATION_SECONDS + 5 * 60, // 5 minutes until expiration
  })

  // First Insert is Good
  card.insertCard(expiringCard)
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Start Voting')))

  // Slow voter clicks around, expiration Time passes, card still works.
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))

  // Card expires, but card still works as expected.
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))
  advanceTimers(60)
  fireEvent.mouseDown(document) // reset Idle Timer
  await wait(() => fireEvent.click(getByText('Next')))

  // Remove card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Reinsert expired card
  card.insertCard(getExpiredVoterCard())
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove Card
  card.removeCard()
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------
})
