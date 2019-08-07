import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import electionSample from '../data/electionSample.json'

import App, {
  electionStorageKey,
  stateStorageKey,
  mergeWithDefaults,
} from '../App'
import { CardAPI, CandidateContest, Election } from '../config/types'

import { handleGamepadButtonDown } from './gamepad'

import {
  noCard,
  voterCard,
  advanceTimers,
} from '../__tests__/helpers/smartcards'

const election = electionSample as Election
const contest0 = election.contests[0] as CandidateContest
const contest1 = election.contests[1] as CandidateContest
const contest0candidate0 = contest0.candidates[0]
const contest0candidate1 = contest0.candidates[1]
const contest1candidate0 = contest1.candidates[0]

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

const getActiveElement = () => document.activeElement! as HTMLInputElement

let currentCard: CardAPI = noCard

fetchMock.get('/card/read', () => JSON.stringify(currentCard))

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`gamepad controls work`, async () => {
  jest.useFakeTimers()

  // load election from localStorage
  window.localStorage.setItem(electionStorageKey, electionSampleAsString)
  window.localStorage.setItem(
    stateStorageKey,
    '{"ballotsPrintedCount":0,"isLiveMode":true,"isPollsOpen":true}'
  )
  const { getByText } = render(<App />)

  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))

  // for test coverage, we test pressing left and right on gamepad here, should do nothing
  handleGamepadButtonDown('DPadLeft')
  handleGamepadButtonDown('DPadRight')

  // Go to Voting Instructions
  fireEvent.click(getByText('Get Started'))

  // Go to First Contest
  advanceTimers()
  fireEvent.click(getByText('Start Voting'))

  advanceTimers()
  // First Contest Page
  getByText(contest0.title)

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1)

  // Test navigation by gamepad
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.id).toEqual(contest0candidate0.id)
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.id).toEqual(contest0candidate1.id)
  handleGamepadButtonDown('DPadUp')
  expect(getActiveElement().dataset.id).toEqual(contest0candidate0.id)

  // test the edge case of rolling over
  handleGamepadButtonDown('DPadUp')
  expect(document.activeElement!.textContent).toEqual('Settings')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.id).toEqual(contest0candidate0.id)

  handleGamepadButtonDown('DPadRight')
  advanceTimers()
  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().dataset.id).toEqual(contest1candidate0.id)
  handleGamepadButtonDown('DPadLeft')
  advanceTimers()
  // B is same as down
  handleGamepadButtonDown('B')
  expect(getActiveElement().dataset.id).toEqual(contest0candidate0.id)

  // select and unselect
  handleGamepadButtonDown('A')
  expect(getActiveElement().dataset.selected).toBe('true')
  handleGamepadButtonDown('A')
  expect(getActiveElement().dataset.selected).toBe('false')

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(getByText(contest0candidate0.name))
  fireEvent.click(getByText(contest0candidate1.name))
  handleGamepadButtonDown('DPadDown') // selects Okay button
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  expect(getActiveElement().textContent).toBe('Okay')
})
