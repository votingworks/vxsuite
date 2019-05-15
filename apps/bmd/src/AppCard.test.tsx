import React from 'react'
import ReactDOM from 'react-dom'
import { render } from 'react-testing-library'

import electionSample from './data/electionSample.json'

import Root, { App } from './App'
import { ActivationCardData, AdminCardData, Election } from './config/types'

const election = electionSample as Election

beforeEach(() => {
  window.localStorage.clear()
  window.location.href = '/'
  fetchMock.resetMocks()
})

it(`App fetches the card data every 1 second`, async () => {
  jest.useFakeTimers()

  fetchMock.mockResponses(
    [JSON.stringify({}), { status: 200 }],
    [
      JSON.stringify({
        present: true,
        shortValue: JSON.stringify({
          t: 'activation',
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
  // load the sample election
  const div = document.createElement('div')
  // @ts-ignore the compiler really wants us to provide full context to App, but that's gnarly and unnecessary
  const app = ReactDOM.render(<App />, div) as App

  app.activateBallot = jest.fn()

  const adminCardData: AdminCardData = {
    h: 'abcdef',
    t: 'admin',
  }

  // for now just for code coverage of the else, we don't do anything useful yet
  app.processCardData(adminCardData)

  const activationCardData: ActivationCardData = {
    bs: election.ballotStyles[0].id,
    pr: election.precincts[0].id,
    t: 'activation',
  }

  app.processCardData(activationCardData)
  expect(app.activateBallot).not.toHaveBeenCalled()

  app.state.election = election
  app.processCardData(activationCardData)

  // also bad ballot style and precinct, for coverage.
  const badActivationCardData: ActivationCardData = {
    bs: 'foobar',
    pr: 'barbaz',
    t: 'activation',
  }
  app.processCardData(badActivationCardData)

  expect(app.activateBallot).toBeCalled()
})
