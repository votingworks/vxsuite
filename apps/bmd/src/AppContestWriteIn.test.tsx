import React from 'react'
import { fireEvent, render } from '@testing-library/react'

import electionSample from './data/electionSample.json'

import App, { electionStorageKey, mergeWithDefaults } from './App'
import { CandidateContest, Election } from './config/types'

const election = electionSample as Election
const contest0 = election.contests[0] as CandidateContest

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Write-In Candidate flow with single seat contest`, () => {
  const contestWithWriteIn = electionSample.contests.find(
    c => !!c.allowWriteIns && c.seats === 1
  ) as CandidateContest

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
  while (!queryByText(contestWithWriteIn.title)) {
    fireEvent.click(getByText('Next'))
  }

  // Test Write-In Candidate Modal Cancel
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('Cancel'))

  // Add Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  expect(getByText('Write-In Candidate')).toBeTruthy()
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('O').closest('button')!)
  fireEvent.click(getByText('B').closest('button')!)
  fireEvent.click(getByText('Accept'))

  // Remove Write-In Candidate
  fireEvent.click(getByText('BOB').closest('label')!)
  fireEvent.click(getByText('Yes, Remove.'))

  // Add Different Write-In Candidate
  fireEvent.click(getByText('add write-in candidate').closest('button')!)
  fireEvent.click(getByText('S').closest('button')!)
  fireEvent.click(getByText('A').closest('button')!)
  fireEvent.click(getByText('L').closest('button')!)
  fireEvent.click(getByText('Accept'))
  expect(
    (getByText('SAL')
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()

  // Try to Select Other Candidate when Max Candidates Selected.
  fireEvent.click(
    getByText(contestWithWriteIn.candidates[0].name).closest('label')!
  )
  getByText(
    `You may only select ${contest0.seats} candidate in this contest. To vote for ${contestWithWriteIn.candidates[0].name}, you must first unselect selected candidate.`
  )
  fireEvent.click(getByText('Okay'))

  // Go to review page and confirm write in exists
  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
  }
  fireEvent.click(getByText('Review Selections'))
  expect(getByText('SAL')).toBeTruthy()
  expect(getByText('(write-in)')).toBeTruthy()

  fireEvent.click(getByText('Next'))
})
