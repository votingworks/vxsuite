import { createMemoryHistory } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from '@testing-library/react'

import * as GLOBALS from '../src/config/globals'

// it's necessary to use the no-seal version, which has neither
// of the two optional seal fields, because otherwise
// typescript concludes that sealURL is required.
import electionSampleNoSeal from '../src/data/electionSampleNoSeal.json'

import {
  Contests,
  Election,
  TextSizeSetting,
  VxMarkOnly,
} from '../src/config/types'

import BallotContext from '../src/contexts/ballotContext'
import fakePrinter from './helpers/fakePrinter'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    activateBallot = jest.fn(),
    appMode = VxMarkOnly,
    ballotStyleId = '',
    contests = electionSampleNoSeal.contests as Contests,
    markVoterCardVoided = jest.fn(),
    markVoterCardPrinted = jest.fn(),
    election = electionSampleNoSeal,
    history = createMemoryHistory({ initialEntries: [route] }),
    isLiveMode = false,
    precinctId = '',
    printer = fakePrinter(),
    resetBallot = jest.fn(),
    setUserSettings = jest.fn(),
    updateTally = jest.fn(),
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
          appMode,
          ballotStyleId,
          contests,
          election: election as Election,
          isLiveMode,
          markVoterCardVoided,
          markVoterCardPrinted,
          precinctId,
          printer,
          resetBallot,
          setUserSettings,
          updateTally,
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Returns a properly-typed mock for an already-mocked function.
 *
 * @example
 *
 * import * as fs from 'fs'
 * jest.mock('fs')
 * const readFileMock = mockOf(fs.readFile)
 * readFileMock.mockImplementation(…)
 */
export function mockOf<T extends (...args: any[]) => any>(
  fn: T
): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>
}
/* eslint-enable @typescript-eslint/no-explicit-any */
