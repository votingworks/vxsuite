import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import {
  noCard,
  voterCard,
  advanceTimers,
} from './__tests__/helpers/smartcards'

import {
  presidentContest, // overvote
  // countyCommissionersContest, // multiseat
  // measure102Contest, // yes/no
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from './__tests__/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
  // load election from localStorage
  setElectionInLocalStorage()
  setStateInLocalStorage()
})

it(`Single Seat Contest`, async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //
  const { container, getByText } = render(<App />)

  // Insert Voter Card
  currentCard = voterCard
  advanceTimers()

  // Go to Voting Instructions
  await wait(() => fireEvent.click(getByText('Get Started')))
  advanceTimers()

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))
  advanceTimers()

  // ====================== END CONTEST SETUP ====================== //

  const candidate0 = presidentContest.candidates[0].name
  const candidate1 = presidentContest.candidates[1].name

  getByText(presidentContest.title)
  expect(presidentContest.seats).toEqual(1)

  // Select first candiate
  fireEvent.click(getByText(candidate0))

  // Select second candidate
  fireEvent.click(getByText(candidate1))

  // Overvote modal is triggered
  getByText(
    `You may only select ${presidentContest.seats} candidate in this contest. To vote for ${candidate1}, you must first unselect selected candidate.`
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
