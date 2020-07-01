import { createContext, RefObject } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import { SaveElection } from '../config/types'
import CastVoteRecordFiles from '../utils/CastVoteRecordFiles'

interface AppContextInterface {
  castVoteRecordFiles: CastVoteRecordFiles
  election: OptionalElection
  electionHash: string
  saveElection: SaveElection
  setCastVoteRecordFiles: React.Dispatch<
    React.SetStateAction<CastVoteRecordFiles>
  >
  printBallotRef?: RefObject<HTMLElement>
}

const appContext: AppContextInterface = {
  castVoteRecordFiles: CastVoteRecordFiles.empty,
  election: undefined,
  electionHash: '',
  saveElection: () => undefined,
  setCastVoteRecordFiles: () => undefined,
  printBallotRef: undefined,
}

const AppContext = createContext(appContext)

export default AppContext
