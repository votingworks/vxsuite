import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from 'react-testing-library'

import election from '../public/data/election.json'

import BallotContext from '../src/contexts/ballotContext'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    resetVotes = jest.fn(),
    updateVote = jest.fn(),
    votes = {},
  } = {}
) {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          contests: election.contests,
          resetVotes,
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
