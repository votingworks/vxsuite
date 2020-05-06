import { createContext } from 'react'
import { OptionalElection } from '@votingworks/ballot-encoder'
import { SaveElection } from '../config/types'

interface AppContextInterface {
  election: OptionalElection
  saveElection: SaveElection
}

const appContext: AppContextInterface = {
  election: undefined,
  saveElection: () => undefined,
}

const AppContext = createContext(appContext)

export default AppContext
