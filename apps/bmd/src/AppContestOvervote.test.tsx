import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'
import { CandidateContest, Election } from './config/types'

const election = electionSample as Election
const contest0 = election.contests[0] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest0candidate1 = contest0.candidates[1]

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`Overvote triggers modal`, () => {
  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { container, getByText, getByTestId } = render(<App />)
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'VX.precinct-23.12D' },
  })
  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  fireEvent.click(getByText('Get Started'))

  // Confirm Correct Contest
  getByText(contest0.title)
  expect(contest0.seats).toEqual(1)

  // Test overvote modal
  fireEvent.click(getByText(contest0candidate0.name).closest('label')!)
  fireEvent.click(getByText(contest0candidate1.name).closest('label')!)
  expect(container.firstChild).toMatchSnapshot()
  getByText(
    `You may only select ${
      contest0.seats
    } candidate in this contest. To vote for ${
      contest0candidate1.name
    }, you must first unselect selected candidate.`
  )

  fireEvent.click(getByText('Okay'))
  expect(
    (getByText(contest0candidate0.name)
      .closest('label')!
      .querySelector('input') as HTMLInputElement).checked
  ).toBeTruthy()
})
