import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from '../data/electionSample.json'

import App, { electionStorageKey, mergeWithDefaults } from '../App'
import { CandidateContest, Election } from '../config/types'

import { handleGamepadButtonDown } from './gamepad'

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

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`gamepad controls work`, () => {
  // load election from localStorage
  window.localStorage.setItem(electionStorageKey, electionSampleAsString)
  const { getByTestId, getByText } = render(<App />)

  // for test coverage, we test pressing left and right on gamepad here, should do nothing
  handleGamepadButtonDown('DPadLeft')
  handleGamepadButtonDown('DPadRight')

  // Go to first contest
  // Activation Page
  fireEvent.change(getByTestId('activation-code'), {
    target: {
      value: 'VX.23.12',
    },
  })
  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))

  // Go to Voting Instructions
  fireEvent.click(getByText('Get Started'))

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))

  // First Contest Page
  getByText(contest0.title)

  // Confirm first contest only has 1 seat
  expect(contest0.seats).toEqual(1)

  // Test navigation by gamepad
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().value).toEqual(contest0candidate0.id)
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().value).toEqual(contest0candidate1.id)
  handleGamepadButtonDown('DPadUp')
  expect(getActiveElement().value).toEqual(contest0candidate0.id)

  // test the edge case of rolling over
  handleGamepadButtonDown('DPadUp')
  expect(document.activeElement!.textContent).toEqual('Settings')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().value).toEqual(contest0candidate0.id)

  handleGamepadButtonDown('DPadRight')
  // go up first without focus, then down once, should be same as down once.
  handleGamepadButtonDown('DPadUp')
  handleGamepadButtonDown('DPadDown')
  expect(getActiveElement().value).toEqual(contest1candidate0.id)
  handleGamepadButtonDown('DPadLeft')
  // B is same as down
  handleGamepadButtonDown('B')
  expect(getActiveElement().value).toEqual(contest0candidate0.id)

  // select and unselect
  handleGamepadButtonDown('A')
  expect(getActiveElement().checked).toBe(true)
  handleGamepadButtonDown('A')
  expect(getActiveElement().checked).toBe(false)

  // Confirm 'Okay' is only active element on page. Modal is "true" modal.
  fireEvent.click(getByText(contest0candidate0.name).closest('label')!)
  fireEvent.click(getByText(contest0candidate1.name).closest('label')!)
  handleGamepadButtonDown('DPadDown') // selects Okay button
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  handleGamepadButtonDown('DPadDown') // Okay button should still be selected
  expect(getActiveElement().textContent).toBe('Okay')
})
