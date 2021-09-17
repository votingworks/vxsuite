import { createContext, RefObject } from 'react'
import {
  ElectionDefinition,
  FullElectionTally,
  FullElectionExternalTally,
  Optional,
  UserSession,
} from '@votingworks/types'
import { usbstick, NullPrinter, Printer } from '@votingworks/utils'
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  ExportableTallies,
  ResultsFileType,
  MachineConfig,
} from '../config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'
import { getEmptyFullElectionTally } from '../lib/votecounting'
import { getEmptyExportableTallies } from '../utils/exportableTallies'

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
  saveIsOfficialResults: () => Promise<void>
  resetFiles: (fileType: ResultsFileType) => Promise<void>
  usbDriveStatus: usbstick.UsbDriveStatus
  usbDriveEject: () => Promise<void>
  addPrintedBallot: (printedBallot: PrintedBallot) => void
  printedBallots: PrintedBallot[]
  fullElectionTally: FullElectionTally
  fullElectionExternalTallies: FullElectionExternalTally[]
  isTabulationRunning: boolean
  setFullElectionTally: React.Dispatch<React.SetStateAction<FullElectionTally>>
  saveExternalTallies: (
    externalTallies: FullElectionExternalTally[]
  ) => Promise<void>
  setIsTabulationRunning: React.Dispatch<React.SetStateAction<boolean>>
  generateExportableTallies: () => ExportableTallies
  currentUserSession: Optional<UserSession>
  attemptToAuthenticateUser: (passcode: string) => boolean
  lockMachine: () => void
  machineConfig: MachineConfig
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  electionDefinition: undefined,
  configuredAt: '',
  isOfficialResults: false,
  printer: new NullPrinter(),
  printBallotRef: undefined,
  saveCastVoteRecordFiles: async () => undefined,
  saveElection: async () => undefined,
  setCastVoteRecordFiles: () => undefined,
  saveIsOfficialResults: async () => undefined,
  resetFiles: async () => undefined,
  usbDriveStatus: usbstick.UsbDriveStatus.notavailable,
  usbDriveEject: async () => undefined,
  addPrintedBallot: () => undefined,
  printedBallots: [],
  fullElectionTally: getEmptyFullElectionTally(),
  fullElectionExternalTallies: [],
  setFullElectionTally: () => undefined,
  saveExternalTallies: async () => undefined,
  isTabulationRunning: false,
  setIsTabulationRunning: () => undefined,
  generateExportableTallies: getEmptyExportableTallies,
  currentUserSession: undefined,
  attemptToAuthenticateUser: () => false,
  lockMachine: () => undefined,
  machineConfig: {
    machineId: '0000',
    codeVersion: '',
    bypassAuthentication: false,
  },
}

const AppContext = createContext(appContext)

export default AppContext
