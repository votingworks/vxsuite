import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from '@testing-library/react'

import * as GLOBALS from '../src/config/globals'

// it's necessary to use the no-seal version, which has neither
// of the two optional seal fields, because otherwise
// typescript concludes that sealURL is required.
import electionSampleNoSeal from '../src/data/electionSampleNoSeal.json'

import { Contests, Election, TextSizeSetting } from '../src/config/types'

import { mergeWithDefaults } from '../src/AppRoot'
import BallotContext from '../src/contexts/ballotContext'
import fakePrinter from './helpers/fakePrinter'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    activateBallot = jest.fn(),
    ballotStyleId = '',
    contests = electionSampleNoSeal.contests as Contests,
    markVoterCardUsed = jest.fn(),
    election = electionSampleNoSeal,
    history = createMemoryHistory({ initialEntries: [route] }),
    incrementBallotsPrintedCount = jest.fn(),
    isLiveMode = false,
    precinctId = '',
    printer = fakePrinter(),
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
          incrementBallotsPrintedCount,
          isLiveMode,
          markVoterCardUsed,
          precinctId,
          printer,
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
