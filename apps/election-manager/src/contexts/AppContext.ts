import { createContext, RefObject } from 'react'
import { ElectionDefinition } from '@votingworks/types'
import { usbstick } from '@votingworks/utils'
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  FullElectionTally,
  ExportableTallies,
  FullElectionExternalTally,
} from '../config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'
import { getEmptyFullElectionTally } from '../lib/votecounting'
import { getEmptyExportableTallies } from '../utils/exportableTallies'
import { NullPrinter, Printer } from '../utils/printer'

export interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles
  electionDefinition?: ElectionDefinition
  configuredAt: ISO8601Timestamp
  isOfficialResults: boolean
  printer: Printer
  printBallotRef?: RefObject<HTMLElement>
  saveCastVoteRecordFiles: SaveCastVoteRecordFiles
  saveElection: SaveElection
  setCastVoteRecordFiles: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  saveIsOfficialResults: () => void
  usbDriveStatus: usbstick.UsbDriveStatus
  usbDriveEject: () => void
  addPrintedBallot: (printedBallot: PrintedBallot) => void
  printedBallots: PrintedBallot[]
  fullElectionTally: FullElectionTally
  fullElectionExternalTallies: FullElectionExternalTally[]
  isTabulationRunning: boolean
  setFullElectionTally: React.Dispatch<React.SetStateAction<FullElectionTally>>
  saveExternalTallies: (externalTallies: FullElectionExternalTally[]) => void
  setIsTabulationRunning: React.Dispatch<React.SetStateAction<boolean>>
  generateExportableTallies: () => ExportableTallies
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  electionDefinition: undefined,
  configuredAt: '',
  isOfficialResults: false,
  printer: new NullPrinter(),
  printBallotRef: undefined,
  saveCastVoteRecordFiles: () => undefined,
  saveElection: () => undefined,
  setCastVoteRecordFiles: () => undefined,
  saveIsOfficialResults: () => undefined,
  usbDriveStatus: usbstick.UsbDriveStatus.notavailable,
  usbDriveEject: () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: [],
  setFullElectionTally: () => undefined,
  saveExternalTallies: () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
}

const AppContext = createContext(appContext)

export default AppContext
