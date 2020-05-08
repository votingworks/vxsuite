import { createContext } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import { SaveElection } from '../config/types'

interface AppContextInterface {
  election: OptionalElection
  electionHash: string
  saveElection: SaveElection
}

const appContext: AppContextInterface = {
  election: undefined,
  electionHash: '',
  saveElection: () => undefined,
}

const AppContext = createContext(appContext)

export default AppContext
