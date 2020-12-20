import { createMemoryHistory, History } from 'history'
import React from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from '@testing-library/react'
import {
  Contests,
  Election,
  ElectionDefinition,
  VotesDict,
} from '@votingworks/ballot-encoder'

import * as GLOBALS from '../src/config/globals'

// it's necessary to use the no-seal version, which has neither
// of the two optional seal fields, because otherwise
// typescript concludes that sealURL is required.
import electionSampleNoSeal from '../src/data/electionSampleNoSeal.json'

import {
  MachineConfig,
  MarkVoterCardFunction,
  TextSizeSetting,
  VxMarkOnly,
} from '../src/config/types'

import BallotContext from '../src/contexts/ballotContext'
import fakePrinter from './helpers/fakePrinter'
import fakeMachineConfig from './helpers/fakeMachineConfig'
import { Printer } from '../src/utils/printer'

export function render(
  component: React.ReactNode,
  {
    route = '/',
    ballotStyleId = '',
    contests = electionSampleNoSeal.contests as Contests,
    markVoterCardVoided = jest.fn(),
    markVoterCardPrinted = jest.fn(),
    election = electionSampleNoSeal as Election,
    electionHash = '',
    history = createMemoryHistory({ initialEntries: [route] }),
    isLiveMode = false,
    machineConfig = fakeMachineConfig({ appMode: VxMarkOnly }),
    precinctId = '',
    printer = fakePrinter(),
    resetBallot = jest.fn(),
    setUserSettings = jest.fn(),
    updateTally = jest.fn(),
    updateVote = jest.fn(),
    forceSaveVote = jest.fn(),
    userSettings = { textSize: GLOBALS.TEXT_SIZE as TextSizeSetting },
    votes = {},
  }: {
    route?: string
    ballotStyleId?: string
    contests?: Contests
    markVoterCardVoided?: MarkVoterCardFunction
    markVoterCardPrinted?: MarkVoterCardFunction
    election?: Election
    electionHash?: string
    history?: History
    isLiveMode?: boolean
    machineConfig?: MachineConfig
    precinctId?: string
    printer?: Printer
    resetBallot?(): void
    setUserSettings?(): void
    updateTally?(): void
    updateVote?(): void
    forceSaveVote?(): void
    userSettings?: { textSize: TextSizeSetting }
    votes?: VotesDict
  } = {}
) {
  return {
    ...testRender(
      <BallotContext.Provider
        value={{
          ballotStyleId,
          contests,
          electionDefinition: { election, electionHash } as ElectionDefinition,
          isLiveMode,
          machineConfig,
          markVoterCardVoided,
          markVoterCardPrinted,
          precinctId,
          printer,
          resetBallot,
          setUserSettings,
          updateTally,
          updateVote,
          forceSaveVote,
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
