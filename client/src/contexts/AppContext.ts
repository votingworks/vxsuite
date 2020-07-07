import { createContext, RefObject } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import { SaveElection } from '../config/types'
import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from '../utils/CastVoteRecordFiles'

interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles
  election: OptionalElection
  electionHash: string
  isOfficialResults: boolean
  printBallotRef?: RefObject<HTMLElement>
  saveCastVoteRecordFiles: SaveCastVoteRecordFiles
  saveElection: SaveElection
  setCastVoteRecordFiles: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  saveIsOfficialResults: () => void
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  election: undefined,
  electionHash: '',
  isOfficialResults: false,
  printBallotRef: undefined,
  saveCastVoteRecordFiles: () => undefined,
  saveElection: () => undefined,
  setCastVoteRecordFiles: () => undefined,
  saveIsOfficialResults: () => undefined,
}

const AppContext = createContext(appContext)

export default AppContext
