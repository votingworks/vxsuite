import { createMemoryHistory, MemoryHistory } from 'history'
import React, { RefObject } from 'react'
import { Router } from 'react-router-dom'
import { sha256 } from 'js-sha256'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { electionWithMsEitherNeitherRawData } from '@votingworks/fixtures'
import { Election, ElectionDefinition } from '@votingworks/types'
import { usbstick } from '@votingworks/utils'

import AppContext from '../src/contexts/AppContext'
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  FullElectionTally,
  ExportableTallies,
  FullElectionExternalTally,
} from '../src/config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../src/utils/CastVoteRecordFiles'
import { getEmptyFullElectionTally } from '../src/lib/votecounting'
import { NullPrinter, Printer } from '../src/utils/printer'

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
  printer?: Printer
  printBallotRef?: RefObject<HTMLElement>
  saveCastVoteRecordFiles?: SaveCastVoteRecordFiles
  saveElection?: SaveElection
  setCastVoteRecordFiles?: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  saveIsOfficialResults?: () => void
  usbDriveStatus?: usbstick.UsbDriveStatus
  usbDriveEject?: () => Promise<void>
  addPrintedBallot?: (printedBallot: PrintedBallot) => void
  printedBallots?: PrintedBallot[]
  fullElectionTally?: FullElectionTally
  isTabulationRunning?: boolean
  setFullElectionTally?: React.Dispatch<React.SetStateAction<FullElectionTally>>
  setIsTabulationRunning?: React.Dispatch<React.SetStateAction<boolean>>
  saveExternalTallies?: (
    externalTallies: FullElectionExternalTally[]
  ) => Promise<void>
  fullElectionExternalTallies?: FullElectionExternalTally[]
  generateExportableTallies?: () => ExportableTallies
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
    printer = new NullPrinter(),
    printBallotRef = undefined,
    saveCastVoteRecordFiles = jest.fn(),
    saveElection = jest.fn(),
    setCastVoteRecordFiles = jest.fn(),
    saveIsOfficialResults = jest.fn(),
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    addPrintedBallot = jest.fn(),
    printedBallots = [],
    fullElectionTally = getEmptyFullElectionTally(),
    isTabulationRunning = false,
    setFullElectionTally = jest.fn(),
    setIsTabulationRunning = jest.fn(),
    saveExternalTallies = jest.fn(),
    fullElectionExternalTallies = [],
    generateExportableTallies = jest.fn(),
  } = {} as RenderInAppContextParams
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
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
        saveExternalTallies,
        fullElectionExternalTallies,
        generateExportableTallies,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
