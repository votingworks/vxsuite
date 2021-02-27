import { createMemoryHistory, MemoryHistory } from 'history'
import React, { RefObject } from 'react'
import { Router } from 'react-router-dom'
import { sha256 } from 'js-sha256'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { electionWithMsEitherNeitherRawData } from '@votingworks/fixtures'
import { Election } from '@votingworks/types'

import AppContext from '../src/contexts/AppContext'
import {
  ElectionDefinition,
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  FullElectionTally,
  OptionalFullElectionExternalTally,
  OptionalFile,
} from '../src/config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../src/utils/CastVoteRecordFiles'
import { UsbDriveStatus } from '../src/lib/usbstick'
import { getEmptyFullElectionTally } from '../src/lib/votecounting'

export const eitherNeitherElectionDefinition = {
  election: JSON.parse(electionWithMsEitherNeitherRawData) as Election,
  electionData: electionWithMsEitherNeitherRawData,
  electionHash: sha256(electionWithMsEitherNeitherRawData),
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
  fullElectionTally?: FullElectionTally
  isTabulationRunning?: boolean
  setFullElectionTally?: React.Dispatch<React.SetStateAction<FullElectionTally>>
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>
  setFullElectionExternalTally?: React.Dispatch<
    React.SetStateAction<OptionalFullElectionExternalTally>
  >
  saveExternalVoteRecordsFile?: (externalFile: OptionalFile) => void
  fullElectionExternalTally?: OptionalFullElectionExternalTally
  externalVoteRecordsFile?: OptionalFile
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    castVoteRecordFiles = CastVoteRecordFiles.empty,
    electionDefinition = eitherNeitherElectionDefinition,
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
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setFullElectionTally = jest.fn(),
    setIsTabulationRunning = jest.fn(),
    saveExternalVoteRecordsFile = jest.fn(),
    setFullElectionExternalTally = jest.fn(),
    fullElectionExternalTally = undefined,
    externalVoteRecordsFile = undefined,
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
        saveExternalVoteRecordsFile,
        setFullElectionExternalTally,
        fullElectionExternalTally,
        externalVoteRecordsFile,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
