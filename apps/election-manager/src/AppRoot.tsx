import React, { useState, useRef, useEffect } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { sha256 } from 'js-sha256'

import {
  Election,
  OptionalElection,
  parseElection,
} from '@votingworks/ballot-encoder'

import AppContext from './contexts/AppContext'

import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from './utils/CastVoteRecordFiles'
import { Storage } from './utils/Storage'

import ElectionManager from './components/ElectionManager'
import { SaveElection, OptionalVoteCounts } from './config/types'

export interface AppStorage {
  election?: Election
  cvrFiles?: string
  isOfficialResults?: boolean
}

export interface Props extends RouteComponentProps {
  storage: Storage<AppStorage>
}

export const electionStorageKey = 'election'
export const cvrsStorageKey = 'cvrFiles'
export const isOfficialResultsKey = 'isOfficialResults'

const AppRoot = ({ storage }: Props) => {
  const printBallotRef = useRef<HTMLDivElement>(null)

  const getElection = async () => {
    const election = await storage.get(electionStorageKey)

    return election ? parseElection(election) : undefined
  }

  const getCVRFiles = async () => storage.get(cvrsStorageKey)
  const getIsOfficialResults = async () => storage.get(isOfficialResultsKey)

  const [election, setElection] = useState<OptionalElection>(undefined)
  const [electionHash, setElectionHash] = useState('')
  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState(
    CastVoteRecordFiles.empty
  )
  const [isOfficialResults, setIsOfficialResults] = useState(false)

  const saveIsOfficialResults = async () => {
    setIsOfficialResults(true)
    await storage.set(isOfficialResultsKey, true)
  }

  useEffect(() => {
    ;(async () => {
      if (!election) {
        const storageElection = await getElection()
        if (storageElection) {
          setElection(storageElection)
          setElectionHash(sha256(JSON.stringify(storageElection)))
        }

        if (castVoteRecordFiles === CastVoteRecordFiles.empty) {
          const storageCVRFiles = await getCVRFiles()
          if (storageCVRFiles) {
            setCastVoteRecordFiles(CastVoteRecordFiles.import(storageCVRFiles))
            setIsOfficialResults((await getIsOfficialResults()) || false)
          }
        }
      }
    })()
  })

  const saveCastVoteRecordFiles: SaveCastVoteRecordFiles = (
    newCVRFiles = CastVoteRecordFiles.empty
  ) => {
    setCastVoteRecordFiles(newCVRFiles)
    /*
    // TURNING OFF STORAGE FOR NOW
    if (newCVRFiles === CastVoteRecordFiles.empty) {
      storage.remove(cvrsStorageKey)
      storage.remove(isOfficialResultsKey)
      setIsOfficialResults(false)
    } else {
      storage.set(cvrsStorageKey, newCVRFiles.export())
    } */
  }

  const [voteCounts, setVoteCounts] = useState<OptionalVoteCounts>()

  const saveElection: SaveElection = (electionDefinition) => {
    setElection(electionDefinition)
    setElectionHash(
      electionDefinition ? sha256(JSON.stringify(electionDefinition)) : ''
    )
    if (electionDefinition) {
      storage.set(electionStorageKey, electionDefinition)
    } else {
      storage.remove(electionStorageKey)
      saveCastVoteRecordFiles()
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        election,
        electionHash,
        isOfficialResults,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        setCastVoteRecordFiles,
        setVoteCounts,
        voteCounts,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
