import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionStorageKey, mergeWithDefaults } from './App'
import { CandidateContest, Election } from './config/types'

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Multi-seat Contest Flow`, () => {
  const multiSeatContest = electionSample.contests.find(
    c => c.seats === 4
  ) as CandidateContest
  expect(multiSeatContest.seats).toEqual(4)

  window.localStorage.setItem(electionStorageKey, electionSampleAsString)
  const { getByText, getByTestId, queryByText } = render(<App />)
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'VX.23.12' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))

  // Go to Voting Instructions
  fireEvent.click(getByText('Get Started'))

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))

  // click Next until getting to multi-seat contest
  while (!queryByText(multiSeatContest.title)) {
    fireEvent.click(getByText('Next'))
  }

  const multiSeatCandidate0 = multiSeatContest.candidates[0]
  const multiSeatCandidate1 = multiSeatContest.candidates[1]
  const multiSeatCandidate2 = multiSeatContest.candidates[2]
  const multiSeatCandidate3 = multiSeatContest.candidates[3]
  const multiSeatCandidate4 = multiSeatContest.candidates[4]
  fireEvent.click(getByText(multiSeatCandidate0.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate1.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate2.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate3.name).closest('label')!)
  fireEvent.click(getByText(multiSeatCandidate4.name).closest('label')!)
  getByText(
    `You may only select ${
      multiSeatContest.seats
    } candidates in this contest. To vote for ${
      multiSeatCandidate4.name
    }, you must first unselect selected candidates.`
  )

  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
  }
  fireEvent.click(getByText('Review Selections'))
  expect(getByText(multiSeatCandidate0.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate1.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate2.name)).toBeTruthy()
  expect(getByText(multiSeatCandidate3.name)).toBeTruthy()
})
