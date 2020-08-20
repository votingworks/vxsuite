import { createContext, RefObject } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import {
  SaveElection,
  OptionalVoteCounts,
  PrintedBallot,
  ISO8601Timestamp,
} from '../config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'

interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles
  election: OptionalElection
  electionHash: string
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
  usbDriveStatus: string
  usbDriveEject: () => void
  addPrintedBallot: (printedBallot: PrintedBallot) => void
  printedBallots: PrintedBallot[]
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  election: undefined,
  electionHash: '',
  configuredAt: '',
  isOfficialResults: false,
  printBallotRef: undefined,
  saveCastVoteRecordFiles: () => undefined,
  saveElection: () => undefined,
  setCastVoteRecordFiles: () => undefined,
  saveIsOfficialResults: () => undefined,
  setVoteCounts: () => undefined,
  voteCounts: undefined,
  usbDriveStatus: '',
  usbDriveEject: () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
}

const AppContext = createContext(appContext)

export default AppContext
