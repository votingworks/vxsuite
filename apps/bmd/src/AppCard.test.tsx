import React from 'react'
// import ReactDOM from 'react-dom'
import { render } from '@testing-library/react'
import fetchMock from 'fetch-mock'

// import Root, { App } from './App'
import Root from './App'
// import {
//   // CardAPI,
//   // ClerkCardData,
//   // PollworkerCardData,
//   // VoterCardData,
// } from './config/types'

import { noCard, voterCard, advanceTimers } from '../test/helpers/smartcards'

let currentCard = noCard
fetchMock.get('/card/read', () => JSON.stringify(currentCard))

beforeEach(() => {
  window.localStorage.clear()
})

// TODO: Delete this test? Is it useful?
xit('App fetches the card data every 200 ms', () => {
  jest.useFakeTimers()

  render(<Root />)

  expect(window.setInterval).toHaveBeenCalledTimes(1)

  currentCard = noCard
  advanceTimers()
  currentCard = voterCard
  advanceTimers()
  currentCard = noCard
  advanceTimers()

  expect(fetchMock.calls('/card/read').length).toEqual(3)
})

// it(`CardData processing processes card data properly`, () => {
//   const div = document.createElement('div')
//   // @ts-ignore - App expects ReactRouter props, but are unnecessary for this test.
//   const app = (ReactDOM.render(<App />, div) as unknown) as App

//   app.activateBallot = jest.fn()
//   app.fetchElection = jest
//     .fn()
//     .mockResolvedValue({ longValue: JSON.stringify(election) })
//   app.setElection = jest.fn()

//   // pollworker card
//   // TODO: fill in the right tests for this card
//   const pollworkerCardData: PollworkerCardData = {
//     h: 'abcdef',
//     t: 'pollworker',
//   }
//   app.processCardData({
//     cardData: pollworkerCardData,
//     longValueExists: false,
//   })

//   const clerkCardData: ClerkCardData = {
//     h: 'abcdef',
//     t: 'clerk',
//   }

//   app.processCardData({
//     cardData: clerkCardData,
//     longValueExists: false,
//   })
//   expect(app.fetchElection).not.toHaveBeenCalled()

//   app.state.election = election
//   app.processCardData({
//     cardData: clerkCardData,
//     longValueExists: true,
//   })
//   expect(app.fetchElection).not.toHaveBeenCalled()

//   app.state.election = undefined
//   app.processCardData({
//     cardData: clerkCardData,
//     longValueExists: true,
//   })
//   expect(app.fetchElection).not.toHaveBeenCalled()

//   app.processCardData({
//     cardData: clerkCardData,
//     longValueExists: true,
//   })
//   expect(app.fetchElection).toHaveBeenCalled()

//   const voterCardData: VoterCardData = {
//     bs: election.ballotStyles[0].id,
//     pr: election.precincts[0].id,
//     t: 'voter',
//   }

//   app.processCardData({
//     cardData: voterCardData,
//     longValueExists: false,
//   })
//   expect(app.activateBallot).not.toHaveBeenCalled()

//   app.state.election = election
//   app.processCardData({
//     cardData: voterCardData,
//     longValueExists: false,
//   })

//   // also bad ballot style and precinct, for coverage.
//   const badVoterCardData: VoterCardData = {
//     bs: 'foobar',
//     pr: 'barbaz',
//     t: 'voter',
//   }
//   app.processCardData({
//     cardData: badVoterCardData,
//     longValueExists: false,
//   })

//   expect(app.activateBallot).toBeCalled()
// })

// it(`Calls fetch on fetchElection`, () => {
//   // fetchMock.resetMocks()

//   // fetchMock.mockResponse(JSON.stringify(election))

//   const div = document.createElement('div')
//   // @ts-ignore - App expects ReactRouter props, but are unnecessary for this test.
//   const app = (ReactDOM.render(<App />, div) as unknown) as App

//   app.fetchElection()

//   expect(fetchMock).toHaveBeenCalled()
// })
