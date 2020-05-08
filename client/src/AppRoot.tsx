import React, { useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import ObjectHash from 'object-hash'

import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import AppContext from './contexts/AppContext'

import { Storage } from './utils/Storage'

import UnconfiguredApp from './components/UnconfiguredApp'
import ElectionManager from './components/ElectionManager'
import { SaveElection } from './config/types'

export interface AppStorage {
  election?: Election
}

export interface Props extends RouteComponentProps {
  storage: Storage<AppStorage>
}

export const electionStorageKey = 'election'

const AppRoot = ({ storage }: Props) => {
  const getElection = () => storage.get(electionStorageKey)
  const storageElection = getElection()
  const [electionHash, setElectionHash] = useState(
    storageElection ? ObjectHash(storageElection) : ''
  )
  const [election, setElection] = useState<OptionalElection>(storageElection)

  const saveElection: SaveElection = (electionConfigFile) => {
    const election = electionConfigFile
    setElection(election)
    setElectionHash(election ? ObjectHash(election) : '')
    if (election === undefined) {
      storage.remove(electionStorageKey)
    } else {
      storage.set(electionStorageKey, election)
    }
  }

  return (
    <AppContext.Provider
      value={{
        election,
        electionHash,
        saveElection,
      }}
    >
      {election ? (
        <ElectionManager />
      ) : (
        <UnconfiguredApp election={election} saveElection={saveElection} />
      )}
    </AppContext.Provider>
  )
}

export default AppRoot
