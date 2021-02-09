import { createMemoryHistory, MemoryHistory } from 'history'
import React, { RefObject } from 'react'
import { Router } from 'react-router-dom'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import * as fs from 'fs'
import { sha256 } from 'js-sha256'
import { join } from 'path'
import { parseElection } from '@votingworks/types'

import AppContext from '../src/contexts/AppContext'
import {
  ElectionDefinition,
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  OptionalFullElectionTally,
} from '../src/config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../src/utils/CastVoteRecordFiles'
import { UsbDriveStatus } from '../src/lib/usbstick'

const eitherNeitherElectionData = fs.readFileSync(
  join(
    __dirname,
    'fixtures/eitherneither-election/eitherneither-election.json'
  ),
  'utf-8'
)
const eitherNeitherElectionHash = sha256(eitherNeitherElectionData)
const eitherNeitherElection = parseElection(
  JSON.parse(eitherNeitherElectionData)
)

export const defaultElectionDefinition = {
  election: eitherNeitherElection,
  electionData: eitherNeitherElectionData,
  electionHash: eitherNeitherElectionHash,
}

interface RenderInAppContextParams {
  route?: string | undefined
  history?: MemoryHistory<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  castVoteRecordFiles?: CastVoteRecordFiles
  electionDefinition?: ElectionDefinition
  configuredAt?: ISO8601Timestamp
  isOfficialResults?: boolean
  printBallotRef?: RefObject<HTMLElement>
  saveCastVoteRecordFiles?: SaveCastVoteRecordFiles
  saveElection?: SaveElection
  setCastVoteRecordFiles?: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  saveIsOfficialResults?: () => void
  usbDriveStatus?: UsbDriveStatus
  usbDriveEject?: () => void
  addPrintedBallot?: (printedBallot: PrintedBallot) => void
  printedBallots?: PrintedBallot[]
  fullElectionTally?: OptionalFullElectionTally
  isTabulationRunning?: boolean
  setFullElectionTally?: React.Dispatch<
    React.SetStateAction<OptionalFullElectionTally>
  >
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    castVoteRecordFiles = CastVoteRecordFiles.empty,
    electionDefinition = defaultElectionDefinition,
    configuredAt = '',
    isOfficialResults = false,
    printBallotRef = undefined,
    saveCastVoteRecordFiles = jest.fn(),
    saveElection = jest.fn(),
    setCastVoteRecordFiles = jest.fn(),
    saveIsOfficialResults = jest.fn(),
    usbDriveStatus = UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    addPrintedBallot = jest.fn(),
    printedBallots = [],
    fullElectionTally = undefined,
    isTabulationRunning = false,
    setFullElectionTally = jest.fn(),
    setIsTabulationRunning = jest.fn(),
  } = {} as RenderInAppContextParams
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
        configuredAt,
        isOfficialResults,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        setCastVoteRecordFiles,
        saveIsOfficialResults,
        usbDriveStatus,
        usbDriveEject,
        addPrintedBallot,
        printedBallots,
        fullElectionTally,
        isTabulationRunning,
        setFullElectionTally,
        setIsTabulationRunning,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
