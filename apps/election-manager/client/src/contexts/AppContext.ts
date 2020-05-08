import { createContext, RefObject } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import { SaveElection } from '../config/types'

interface AppContextInterface {
  election: OptionalElection
  electionHash: string
  saveElection: SaveElection
  printBallotRef?: RefObject<HTMLElement>
}

const appContext: AppContextInterface = {
  election: undefined,
  electionHash: '',
  saveElection: () => undefined,
  printBallotRef: undefined,
}

const AppContext = createContext(appContext)

export default AppContext
