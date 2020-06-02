import React, { useState, useRef } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import ObjectHash from 'object-hash'

import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import AppContext from './contexts/AppContext'

import { Storage } from './utils/Storage'

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
  const [election, setElection] = useState<OptionalElection>(getElection())
  const printBallotRef = useRef<HTMLDivElement>(null)

  const saveElection: SaveElection = (electionDefinition) => {
    setElection(electionDefinition)
    setElectionHash(electionDefinition ? ObjectHash(electionDefinition) : '')
    if (electionDefinition === undefined) {
      storage.remove(electionStorageKey)
    } else {
      storage.set(electionStorageKey, electionDefinition)
    }
  }

  return (
    <AppContext.Provider
      value={{
        election,
        electionHash,
        printBallotRef,
        saveElection,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
