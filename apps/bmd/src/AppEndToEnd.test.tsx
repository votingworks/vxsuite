import React from 'react'
import { fireEvent, render } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import waitForExpect from 'wait-for-expect'
import electionSample from './data/electionSample.json'

import App, { mergeWithDefaults } from './App'
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

async function sleep(milliseconds: number) {
  return new Promise(resolve => {
    window.setTimeout(resolve, milliseconds)
  })
}

const cardValueVoter = {
  present: true,
  shortValue: JSON.stringify({
    t: 'voter',
    pr: '23',
    bs: '12',
  }),
}

const cardValueVoterUsed = {
  present: true,
  shortValue: JSON.stringify({
    t: 'voter',
    pr: '23',
    bs: '12',
    uz: new Date().getTime(),
  }),
}

const cardValueAbsent = {
  present: false,
  shortValue: '',
}

const cardValueClerk = {
  longValueExists: true,
  present: true,
  shortValue: JSON.stringify({
    t: 'clerk',
    h: 'abcd',
  }),
}

it(`basic end-to-end flow`, async () => {
  let cardFunctionsAsExpected = true
  let currentCardValue = cardValueAbsent

  fetchMock.get('/card/read', () => {
    return JSON.stringify(currentCardValue)
  })

  fetchMock.get('/card/read_long', () => {
    return JSON.stringify({ longValue: electionSampleAsString })
  })

  fetchMock.post('/card/write', (url, options) => {
    // if we want to simulate a card that is malfunctioning,
    // we don't accept the write
    if (cardFunctionsAsExpected) {
      currentCardValue = { present: true, shortValue: options.body as string }
    }
    return ''
  })

  const eventListenerCallbacksDictionary: any = {} // eslint-disable-line @typescript-eslint/no-explicit-any
  window.addEventListener = jest.fn((event, cb) => {
    eventListenerCallbacksDictionary[event] = cb
  })
  window.print = jest.fn(() => {
    eventListenerCallbacksDictionary.afterprint()
  })

  const { container, getByText, getByTestId, queryByText } = render(<App />)

  // first the clerk card
  currentCardValue = cardValueClerk
  await sleep(250)

  getByText('Scan Your Activation Code')

  // first a voter card that's already been used
  currentCardValue = cardValueVoterUsed
  await sleep(250)
  getByText('Scan Your Activation Code')

  // then the voter card that is good to go
  currentCardValue = cardValueVoter
  await sleep(250)

  // Get Started Page
  expect(container.firstChild).toMatchSnapshot()

  // Go to First Contest
  fireEvent.click(getByText('Get Started'))

  // take out card, should reset
  currentCardValue = cardValueAbsent
  await sleep(250)

  getByTestId('activation-code')

  // ok put the card back in
  currentCardValue = cardValueVoter
  await sleep(250)

  // Go to Voting Instructions
  fireEvent.click(getByText('Get Started'))

  // Go to First Contest
  fireEvent.click(getByText('Start Voting'))

  // Vote for President contest
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(
    getByText(presidentContest.candidates[0].name).closest('label')!
  )
  expect(container.firstChild).toMatchSnapshot()

  // Vote for Measure 102 contest
  while (!queryByText(measure102Contest.title)) {
    fireEvent.click(getByText('Next'))
  }
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(getByText('Yes').closest('label')!)
  expect(container.firstChild).toMatchSnapshot()

  // Go to Pre Review Screen
  while (!queryByText('Review Your Selections')) {
    fireEvent.click(getByText('Next'))
  }
  expect(container.firstChild).toMatchSnapshot()

  // Go to Review Screen
  fireEvent.click(getByText('Review Selections'))
  getByText('Review Your Ballot Selections')
  expect(container.firstChild).toMatchSnapshot()

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByText(
      `${countyCommissionersContest.section}, ${countyCommissionersContest.title}`
    ).closest('button')!
  )
  // Select first candidate
  expect(container.firstChild).toMatchSnapshot()
  fireEvent.click(
    getByText(countyCommissionersContest.candidates[0].name).closest('label')!
  )
  fireEvent.click(
    getByText(countyCommissionersContest.candidates[1].name).closest('label')!
  )
  expect(container.firstChild).toMatchSnapshot()
  // Back to Review screen
  fireEvent.click(getByText('Review Ballot'))
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may select 2 more candidates.')
  expect(container.firstChild).toMatchSnapshot()

  // Print Screen
  fireEvent.click(getByText('Next'))
  getByText('Print your official ballot')

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No, go back.'))
  fireEvent.click(getByText('Print Ballot'))

  // card malfunctions, we should not advance
  cardFunctionsAsExpected = false
  fireEvent.click(getByText('Yes, print my ballot.'))
  await waitForExpect(() => {
    expect(window.print).not.toBeCalled()
  })

  cardFunctionsAsExpected = true
  fireEvent.click(getByText('Yes, print my ballot.'))
  await waitForExpect(() => {
    expect(window.print).toBeCalled()
  })

  // Review and Cast Instructions
  // wait a little bit because the page transition is behind a setTimeout
  await sleep(100)
  getByText('Cast your printed ballot')

  // ===========================================================================
  // TODO: determine why test errors occur here when the following click is uncommented.
  // Errors:
  // - TypeError: stack.split is not a function
  // - multiple errors
  //   - Error: Uncaught [RangeError: Maximum call stack size exceeded]
  //   - Error: Uncaught [Error: An error was thrown inside one of your components, but React doesn't know what it was. This is likely due to browser flakiness. React does its best to preserve the "Pause on exceptions" behavior of the DevTools, which requires some DEV-mode only tricks. It's possible that these don't work in your browser. Try triggering the error in production mode, or switching to a modern browser. If you suspect that this is actually an issue with React, please file an issue.]
  // ===========================================================================

  // fireEvent.click(getByText('Start Over'))

  // Redirected to Activation
  // getByText('Scan Your Activation Code')
})
