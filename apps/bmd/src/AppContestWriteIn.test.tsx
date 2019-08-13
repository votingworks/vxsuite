import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import App from './App'

import { noCard, voterCard, advanceTimers } from '../test/helpers/smartcards'

import {
  singleSeatContestWithWriteIn,
  setElectionInLocalStorage,
  setStateInLocalStorage,
} from '../test/helpers/election'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

jest.useFakeTimers()

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Single Seat Contest`, async () => {
  // ====================== BEGIN CONTEST SETUP ====================== //

  setElectionInLocalStorage()
  setStateInLocalStorage()

  const { container, getByText, queryByText } = render(<App />)

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

  // Advance to Single-Seat Contest with Write-In
  while (!queryByText(singleSeatContestWithWriteIn.title)) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  // Capture styles of Single Candidate Contest
  expect(container.firstChild).toMatchSnapshot()

  // Enter Write-in Candidate Name
  fireEvent.click(getByText('B'))
  fireEvent.click(getByText('O'))
  fireEvent.click(getByText('V'))
  fireEvent.click(getByText('⌫ delete'))
  fireEvent.click(getByText('B'))
  fireEvent.click(getByText('Accept'))
  advanceTimers()

  // Remove Write-In Candidate
  // await wait(() => getByText('BOB'))
  fireEvent.click(getByText('BOB').closest('button')!)
  fireEvent.click(getByText('Yes, Remove.'))
  advanceTimers()

  // Add Different Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('S').closest('button')!)
  fireEvent.click(getByText('A').closest('button')!)
  fireEvent.click(getByText('L').closest('button')!)
  fireEvent.click(getByText('Accept'))
  expect(getByText('SAL').closest('button')!.dataset.selected).toBe('true')

  // Try to Select Other Candidate when Max Candidates Selected.
  fireEvent.click(
    getByText(singleSeatContestWithWriteIn.candidates[0].name).closest(
      'button'
    )!
  )
  getByText(
    `You may only select ${singleSeatContestWithWriteIn.seats} candidate in this contest. To vote for ${singleSeatContestWithWriteIn.candidates[0].name}, you must first unselect selected candidate.`
  )
  fireEvent.click(getByText('Okay'))
  advanceTimers() // For 200ms Delay in closing modal

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
    advanceTimers()
  }
  fireEvent.click(getByText('Review Selections'))
  advanceTimers()
  expect(getByText('SAL')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()
})
