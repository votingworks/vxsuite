import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getExpiredVoterCard,
  getNewVoterCard,
  getUsedVoterCard,
  getVoterCardWithVotes,
  noCard,
  pollWorkerCard,
} from '../test/helpers/smartcards'

import { electionAsString } from '../test/helpers/election'

import { printerMessageTimeoutSeconds } from './pages/PrintOnlyScreen'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

fetchMock.post('/card/write', (url, options) => {
  currentCard = {
    present: true,
    shortValue: options.body as string,
  }
  return ''
})

fetchMock.get('/card/read_long', () =>
  JSON.stringify({ longValue: electionAsString })
)

fetchMock.get('/printer/status', () => ({
  ok: true,
}))

fetchMock.post('/printer/jobs/new', () => ({
  id: 'printer-job-id',
}))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('VxPrintOnly flow', async () => {
  jest.useFakeTimers()

  const { getByText } = render(<App />)

  currentCard = noCard
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Load Election Definition')))

  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))

  fireEvent.click(getByText('VxPrint Only'))
  expect((getByText('VxPrint Only') as HTMLButtonElement).disabled).toBeTruthy()

  fireEvent.click(getByText('Live Election Mode'))
  getByText('Switch to Live Election Mode and zero Printed Ballots count?')
  fireEvent.click(getByText('Yes'))

  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Polls Closed'))
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Open Polls')))
  getByText('Open polls and print Polls Opened report?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls')
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(1)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Expired Voter Card
  currentCard = getExpiredVoterCard()
  advanceTimers()
  await wait(() => getByText('Expired Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Used Voter Card
  currentCard = getUsedVoterCard()
  advanceTimers()
  await wait(() => getByText('Used Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Voter Card with No Votes
  currentCard = getNewVoterCard()
  advanceTimers()
  await wait(() => getByText('Empty Card'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Complete VxPrint Voter Happy Path

  // Default state
  getByText('Insert Card')

  // Insert Voter card
  currentCard = getVoterCardWithVotes()

  // Show Printing Ballot screen
  advanceTimers()
  await wait(() => getByText('Printing your official ballot'))

  // After timeout, show Verify and Cast Instructions
  advanceTimers(printerMessageTimeoutSeconds)
  await wait(() => getByText('Verify and Cast Printed Ballot'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(2)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // Insert Pollworker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Close Polls')))
  getByText('Close Polls and print Polls Closed report?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open Polls')
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(3)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Poll Worker card to open.'))

  // Unconfigure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))
  fireEvent.click(getByText('Remove'))
  advanceTimers()

  // Default Unconfigured
  getByText('Device Not Configured')
})
