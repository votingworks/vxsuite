import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from 'react-testing-library'

import GLOBALS from '../src/config/globals'

import electionSample from '../src/data/electionSample.json'

import { Contests, Election, TextSizeSetting } from '../src/config/types'

import { mergeWithDefaults } from '../src/App'
import BallotContext from '../src/contexts/ballotContext'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    activateBallot = jest.fn(),
    ballotStyleId = '',
    contests = electionSample.contests as Contests,
    markVoterCardUsed = jest.fn(),
    election = electionSample,
    history = createMemoryHistory({ initialEntries: [route] }),
    precinctId = '',
    resetBallot = jest.fn(),
    setUserSettings = jest.fn(),
    updateVote = jest.fn(),
    userSettings = { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
    votes = {},
  } = {}
) {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          activateBallot,
          ballotStyleId,
          contests,
          election: mergeWithDefaults(election as Election),
          markVoterCardUsed,
          precinctId,
          resetBallot,
          setUserSettings,
          updateVote,
          userSettings,
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
