import React from 'react'
import { fireEvent, render, wait } from '@testing-library/react'
import fetchMock from 'fetch-mock'

import waitForExpect from 'wait-for-expect'
import GLOBALS from './config/globals'

import { getBallotStyle, getContests } from './utils/election'

import { printingModalDisplaySeconds } from './pages/PrintPage'

import electionSample from './data/electionSample.json'

import App, { mergeWithDefaults } from './App'
import {
  CardAPI,
  CandidateContest,
  Election,
  YesNoContest,
} from './config/types'

jest.useFakeTimers()

const election = electionSample as Election

const electionSampleAsString = JSON.stringify(mergeWithDefaults(election))

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

const noCard: CardAPI = {
  present: false,
}

const adminCard: CardAPI = {
  present: true,
  longValueExists: true,
  shortValue: JSON.stringify({
    t: 'clerk',
    h: 'abcd',
  }),
}

const pollWorkerCard: CardAPI = {
  present: true,
  shortValue: JSON.stringify({
    t: 'pollworker',
    h: 'abcd',
  }),
}

const voterCardShortValue = {
  t: 'voter',
  pr: election.precincts[0].id,
  bs: election.ballotStyles[0].id,
}

const voterCard: CardAPI = {
  present: true,
  shortValue: JSON.stringify(voterCardShortValue),
}

const invalidatedVoterCard: CardAPI = {
  present: true,
  shortValue: JSON.stringify({
    ...voterCardShortValue,
    uz: new Date().getTime(),
  }),
}

const getPrintedVoterCard = (): CardAPI => ({
  present: true,
  shortValue: JSON.stringify({
    ...voterCardShortValue,
    bp: 1,
    uz: new Date().getTime(),
  }),
})

const voterContests = getContests({
  ballotStyle: getBallotStyle({
    ballotStyleId: voterCardShortValue.bs,
    election,
  }),
  election,
})

let currentCard: CardAPI = noCard

const advanceTimers = (ms: number = 0) => {
  jest.advanceTimersByTime(ms + GLOBALS.CARD_POLLING_INTERVAL)
}

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'

  currentCard = noCard

  fetchMock.get('/machine-id', () => JSON.stringify({ machineId: '1' }))

  fetchMock.get('/card/read', () => JSON.stringify(currentCard))

  fetchMock.post('/card/write', (url, options) => {
    currentCard = {
      present: true,
      shortValue: options.body as string,
    }
    return ''
  })

  fetchMock.get('/card/read_long', () =>
    JSON.stringify({ longValue: electionSampleAsString })
  )
})

it(`basic end-to-end flow`, async () => {
  const { getByText } = render(<App />)

  // Default Unconfigured
  getByText('Device Not Configured')

  // ---------------

  // Configure with Admin Card
  currentCard = adminCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Load Election Definition')))

  advanceTimers()
  await wait(() => getByText('Election definition is loaded.'))

  fireEvent.click(getByText('Live Election Mode'))
  getByText('Switch to Live Election Mode and zero Printed Ballots count?')
  fireEvent.click(getByText('Yes'))

  expect(
    (getByText('Live Election Mode') as HTMLButtonElement).disabled
  ).toBeTruthy()

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Polls Closed'))
  getByText('Insert Poll Worker card to open.')

  // ---------------

  // Open Polls with Poll Worker Card
  currentCard = pollWorkerCard
  advanceTimers()
  await wait(() => fireEvent.click(getByText('Open Polls')))
  getByText('Open polls -- Print report 1 of 3?')
  fireEvent.click(getByText('Yes'))
  getByText('Open polls -- Print report 2 of 3?')
  fireEvent.click(getByText('Yes'))
  getByText('Open polls -- Print report 3 of 3?')
  fireEvent.click(getByText('Yes'))
  getByText('Close Polls')

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert used Voter card
  currentCard = invalidatedVoterCard
  advanceTimers()
  await wait(() => getByText('This card is no longer active.'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Insert Voter card, go to first contest, then remove card, expect to be on
  // insert card screen.
  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))
  fireEvent.click(getByText('Get Started'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // ---------------

  // Complete Voter Happy Path

  // Insert Voter card
  currentCard = voterCard
  advanceTimers()
  await wait(() => getByText(/Precinct: Center Springfield/))
  getByText(/Ballot Style: 12/)
  fireEvent.click(getByText('Get Started'))

  advanceTimers()
  fireEvent.click(getByText('Start Voting'))

  // Advance through every contest
  for (let i = 0; i < voterContests.length; i++) {
    const title = voterContests[i].title

    advanceTimers()
    getByText(title)

    // Vote for candidate contest
    if (title === presidentContest.title) {
      fireEvent.click(getByText(presidentContest.candidates[0].name))
    }
    // Vote for yesno contest
    else if (title === measure102Contest.title) {
      fireEvent.click(getByText('Yes'))
    }

    fireEvent.click(getByText('Next'))
  }

  // Pre-Review screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Review Your Selections')
  fireEvent.click(getByText('Review Selections'))

  // Review Screen
  advanceTimers()
  getByText('Review Your Ballot Selections')
  getByText(presidentContest.candidates[0].name)
  getByText(`Yes on ${measure102Contest.shortTitle}`)

  // Change "County Commissioners" Contest
  fireEvent.click(
    getByText(
      `${countyCommissionersContest.section}, ${countyCommissionersContest.title}`
    )
  )
  advanceTimers()
  getByText(/Vote for 4/i)

  // Select first candidate
  fireEvent.click(getByText(countyCommissionersContest.candidates[0].name))
  fireEvent.click(getByText(countyCommissionersContest.candidates[1].name))

  // Back to Review screen
  fireEvent.click(getByText('Review Ballot'))
  advanceTimers()
  getByText('Review Your Ballot Selections')
  getByText(countyCommissionersContest.candidates[0].name)
  getByText(countyCommissionersContest.candidates[1].name)
  getByText('You may select 2 more candidates.')

  // Print Screen
  fireEvent.click(getByText('Next'))
  advanceTimers()
  getByText('Print your official ballot')

  // Test Print Ballot Modal
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('No, go back.'))
  fireEvent.click(getByText('Print Ballot'))
  fireEvent.click(getByText('Yes, print my ballot.'))
  advanceTimers()
  await waitForExpect(() => {
    expect(window.print).toBeCalled()
  })

  // Wait for printing setTimeout
  advanceTimers(printingModalDisplaySeconds * 1000)

  // Review and Cast Instructions
  await wait(() => getByText('You’re Almost Done…'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))

  // Insert Voter card which has just printed.
  currentCard = getPrintedVoterCard()
  advanceTimers()
  await wait(() => getByText('You’re Almost Done…'))

  // Remove card
  currentCard = noCard
  advanceTimers()
  await wait(() => getByText('Insert voter card to load ballot.'))
})
