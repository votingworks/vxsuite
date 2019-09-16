import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  adminCard,
  advanceTimers,
  getVoterCardWithVotes,
  noCard,
  pollWorkerCard,
} from '../test/helpers/smartcards'

import { electionAsString } from '../test/helpers/election'

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

it('VxMarkOnly flow', async () => {
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
  getByText('Open polls -- Print report 1 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open polls -- Print report 2 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open polls -- Print report 3 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // ---------------

  // Insert Expired Voter Card
  // Insert Used Voter Card
  // Insert Voter Card with No Votes

  // ---------------

  // Complete VxPrint Voter Happy Path

  // Default state
  getByText('Insert Card')

  // Insert Voter card
  currentCard = getVoterCardWithVotes()
  advanceTimers()
  await wait(() => getByText('Printing ballot'))
  advanceTimers(5000 + 1000)
  await wait(() => getByText('Official Ballot Printed'))
  expect(fetchMock.calls('/printer/jobs/new')).toHaveLength(1)

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert Card'))

  // Insert Pollworker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Close Polls')))
  getByText('Close Polls -- Print report 1 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls -- Print report 2 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Close Polls -- Print report 3 of 3?')
  await wait(() => fireEvent.click(getByText('Yes')))
  getByText('Open Polls')

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
