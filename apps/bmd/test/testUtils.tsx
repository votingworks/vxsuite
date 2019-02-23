import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from 'react-testing-library'

import election from '../src/data/election.json'

import BallotContext from '../src/contexts/ballotContext'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    resetBallot = jest.fn(),
    setBallotKey = jest.fn(),
    updateVote = jest.fn(),
    votes = {},
  } = {}
) {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          election,
          resetBallot,
          setBallotKey,
          updateVote,
          votes,
        }}
      >
        <Router history={history}>{component}</Router>
      </BallotContext.Provider>
    ),
    history,
  }
}

export default undefined
