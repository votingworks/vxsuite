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
  presidentContest,
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

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it('Single Seat Contest', async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage()

  const { container, getAllByText, getByText } = render(<App />)

  // Insert Voter Card
  currentCard = getNewVoterCard()
  advanceTimers()

  // Go to First Contest
  await wait(() => fireEvent.click(getAllByText('Start Voting')[1]))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name
  const candidate1 = presidentContest.candidates[1].name

  getByText(presidentContest.title)

  // Select first candiate
  fireEvent.click(getByText(candidate0))

  // Select second candidate
  fireEvent.click(getByText(candidate1))

  // Overvote modal is displayed
  getByText(
    `You may only select ${presidentContest.seats} candidate in this contest. To vote for ${candidate1}, you must first unselect the selected candidate.`
  )

  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Close the modal
  fireEvent.click(getByText('Okay'))

  // First candidate is selected
  expect(getByText(candidate0).closest('button')!.dataset.selected).toBe('true')

  // Second candidate is NOT selected
  expect(getByText(candidate1).closest('button')!.dataset.selected).toBe(
    'false'
  )
})
