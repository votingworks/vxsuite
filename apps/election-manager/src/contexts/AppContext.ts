import { createContext, RefObject } from 'react'
import {
  ElectionDefinition,
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  FullElectionTally,
} from '../config/types'
import { UsbDriveStatus } from '../lib/usbstick'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'
import { getEmptyFullElectionTally } from '../lib/votecounting'

export interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles
  electionDefinition?: ElectionDefinition
  configuredAt: ISO8601Timestamp
  isOfficialResults: boolean
  printBallotRef?: RefObject<HTMLElement>
  saveCastVoteRecordFiles: SaveCastVoteRecordFiles
  saveElection: SaveElection
  setCastVoteRecordFiles: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  saveIsOfficialResults: () => void
  usbDriveStatus: UsbDriveStatus
  usbDriveEject: () => void
  addPrintedBallot: (printedBallot: PrintedBallot) => void
  printedBallots: PrintedBallot[]
  fullElectionTally: FullElectionTally
  isTabulationRunning: boolean
  setFullElectionTally: React.Dispatch<React.SetStateAction<FullElectionTally>>
  setIsTabulationRunning: React.Dispatch<React.SetStateAction<boolean>>
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  electionDefinition: undefined,
  configuredAt: '',
  isOfficialResults: false,
  printBallotRef: undefined,
  saveCastVoteRecordFiles: () => undefined,
  saveElection: () => undefined,
  setCastVoteRecordFiles: () => undefined,
  saveIsOfficialResults: () => undefined,
  usbDriveStatus: UsbDriveStatus.notavailable,
  usbDriveEject: () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
  fullElectionTally: getEmptyFullElectionTally(),
  setFullElectionTally: () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
}

const AppContext = createContext(appContext)

export default AppContext
