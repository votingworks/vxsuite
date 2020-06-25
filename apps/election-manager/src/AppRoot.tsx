import React, { useState, useRef } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { sha256 } from 'js-sha256'

import { Election, OptionalElection } from '@votingworks/ballot-encoder'

import AppContext from './contexts/AppContext'

import CastVoteRecordFiles from './utils/CastVoteRecordFiles'
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
    storageElection ? sha256(JSON.stringify(storageElection)) : ''
  )
  const [election, setElection] = useState<OptionalElection>(getElection())
  const printBallotRef = useRef<HTMLDivElement>(null)

  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState(
    CastVoteRecordFiles.empty
  )

  const saveElection: SaveElection = (electionDefinition) => {
    setElection(electionDefinition)
    setElectionHash(
      electionDefinition ? sha256(JSON.stringify(electionDefinition)) : ''
    )
    if (electionDefinition === undefined) {
      storage.remove(electionStorageKey)
    } else {
      storage.set(electionStorageKey, electionDefinition)
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        election,
        electionHash,
        printBallotRef,
        setCastVoteRecordFiles,
        saveElection,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
