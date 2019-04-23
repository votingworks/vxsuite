import React from 'react'
import { fireEvent, render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import App, { electionKey, mergeWithDefaults } from './App'
import { CandidateContest, Election, YesNoContest } from './config/types'

const electionSampleAsString = JSON.stringify(
  mergeWithDefaults(electionSample as Election)
)

const presidentContest = electionSample.contests.find(
  c => c.title === 'President and Vice-President' && c.seats === 1
) as CandidateContest

const countyCommissionersContest = electionSample.contests.find(
  c => c.title === 'County Commissioners' && c.seats === 4
) as CandidateContest

const measure102Contest = electionSample.contests.find(
  c =>
    c.title === 'Measure 102: Vehicle Abatement Program' && c.type === 'yesno'
) as YesNoContest

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`basic end-to-end flow`, async () => {
  /* tslint:disable-next-line */
  const eventListenerCallbacksDictionary: any = {}
  window.addEventListener = jest.fn((event, cb) => {
    eventListenerCallbacksDictionary[event] = cb
  })
  window.print = jest.fn(() => {
    eventListenerCallbacksDictionary.afterprint()
  })

  window.localStorage.setItem(electionKey, electionSampleAsString)
  const { container, getByText, getByTestId, queryByText } = render(<App />)
  fireEvent.change(getByTestId('activation-code'), {
    target: { value: 'MyVoiceIsMyPassword' },
  })

  // TODO: replace next line with "Enter" keyDown on activation code input
  fireEvent.click(getByText('Submit'))
  expect(container.firstChild).toMatchSnapshot()

  // Get Started Page
  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  // Vote for President contest
  fireEvent.click(
    getByText(presidentContest.candidates[0].name).closest('label')!
  )

  // Vote for Measure 102 contest
  while (!queryByText(measure102Contest.title)) {
    fireEvent.click(getByText('Next'))
  }
  fireEvent.click(getByText('Yes').closest('label')!)

  // Go to Pre Review Screen
  while (!queryByText('Pre Review Screen')) {
    fireEvent.click(getByText('Next'))
  }
  getByText('Pre Review Screen')

  // Go to Review Screen
  fireEvent.click(getByText('Next'))
  getByText('Review Your Ballot Selections')

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByText(
      `${countyCommissionersContest.section}, ${
        countyCommissionersContest.title
      }`
    ).closest('a')!
  )
  // Select first candidate
  fireEvent.click(
    getByText(countyCommissionersContest.candidates[0].name).closest('label')!
  )
  // Back to Review screen
  fireEvent.click(getByText('Review Ballot'))

  // Print Screen
  fireEvent.click(getByText('Next'))
  getByText('Print your ballot')

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No, go back.'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, print my ballot.'))
  expect(window.print).toBeCalled()

  // Review and Cast Instructions
  getByText('Verify and Cast Your Ballot')

  // TODO: determine why test errors occur here when the following click is uncommented.
  // Errors:
  // - TypeError: stack.split is not a function
  // - multiple errors
  //   - Error: Uncaught [RangeError: Maximum call stack size exceeded]
  //   - Error: Uncaught [Error: An error was thrown inside one of your components, but React doesn't know what it was. This is likely due to browser flakiness. React does its best to preserve the "Pause on exceptions" behavior of the DevTools, which requires some DEV-mode only tricks. It's possible that these don't work in your browser. Try triggering the error in production mode, or switching to a modern browser. If you suspect that this is actually an issue with React, please file an issue.]

  // fireEvent.click(getByText('Start Over'))

  // Back to beginning
  // getByText('Scan Your Activation Code')
})
