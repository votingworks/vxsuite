import React from 'react'
import ReactDOM from 'react-dom'
import { render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import Root, { App } from './App'
import { AdminCardData, Election, VoterCardData } from './config/types'

const election = electionSample as Election

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
})

it(`App fetches the card data every 1 second`, () => {
  fetchMock.resetMocks()
  jest.useFakeTimers()

  fetchMock.mockResponses(
    [JSON.stringify({}), { status: 200 }],
    // This response covers the App functionality for processing card data.
    [
      JSON.stringify({
        present: true,
        shortValue: JSON.stringify({
          t: 'voter',
          pr: election.precincts[0].id,
          bs: election.ballotStyles[0].id,
        }),
      }),
      { status: 200 },
    ],
    ['', { status: 500 }]
  )

  // load the sample election
  window.location.href = '/#sample'
  render(<Root />)

  expect(window.setInterval).toHaveBeenCalledTimes(1)

  jest.advanceTimersByTime(3000)

  expect(fetchMock.mock.calls.length).toEqual(3)
  expect(fetchMock.mock.calls).toEqual([
    ['/card/read'],
    ['/card/read'],
    ['/card/read'],
  ])

  jest.useRealTimers()
})

it(`CardData processing processes card data properly`, () => {
  const div = document.createElement('div')
  // @ts-ignore - App expects ReactRouter props, but are unnecessary for this test.
  const app = (ReactDOM.render(<App />, div) as unknown) as App

  app.activateBallot = jest.fn()

  const adminCardData: AdminCardData = {
    h: 'abcdef',
    t: 'admin',
  }

  // for now just for code coverage of the else, we don't do anything useful yet
  app.processCardData(adminCardData)

  const voterCardData: VoterCardData = {
    bs: election.ballotStyles[0].id,
    pr: election.precincts[0].id,
    t: 'voter',
  }

  app.processCardData(voterCardData)
  expect(app.activateBallot).not.toHaveBeenCalled()

  app.state.election = election
  app.processCardData(voterCardData)

  // also bad ballot style and precinct, for coverage.
  const badVoterCardData: VoterCardData = {
    bs: 'foobar',
    pr: 'barbaz',
    t: 'voter',
  }
  app.processCardData(badVoterCardData)

  expect(app.activateBallot).toBeCalled()
})
