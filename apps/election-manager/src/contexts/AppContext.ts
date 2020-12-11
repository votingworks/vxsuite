import { createContext, RefObject } from 'react'
import {
  ElectionDefinition,
  SaveElection,
  OptionalVoteCounts,
  PrintedBallot,
  ISO8601Timestamp,
} from '../config/types'
import { UsbDriveStatus } from '../lib/usbstick'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'

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
  setVoteCounts: React.Dispatch<React.SetStateAction<OptionalVoteCounts>>
  voteCounts: OptionalVoteCounts
  usbDriveStatus: UsbDriveStatus
  usbDriveEject: () => void
  addPrintedBallot: (printedBallot: PrintedBallot) => void
  printedBallots: PrintedBallot[]
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
  setVoteCounts: () => undefined,
  voteCounts: undefined,
  usbDriveStatus: UsbDriveStatus.notavailable,
  usbDriveEject: () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
}

const AppContext = createContext(appContext)

export default AppContext
