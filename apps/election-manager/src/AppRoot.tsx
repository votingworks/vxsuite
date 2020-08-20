import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useInterval } from 'use-interval'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { sha256 } from 'js-sha256'

import {
  Election,
  OptionalElection,
  parseElection,
} from '@votingworks/ballot-encoder'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  doUnmount,
  UsbDriveStatus,
} from './lib/usbstick'

import AppContext from './contexts/AppContext'

import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from './utils/CastVoteRecordFiles'
import { Storage } from './utils/Storage'

import ElectionManager from './components/ElectionManager'
import {
  SaveElection,
  OptionalVoteCounts,
  PrintedBallot,
  ISO8601Timestamp,
} from './config/types'

export interface AppStorage {
  election?: Election
  cvrFiles?: string
  isOfficialResults?: boolean
  printedBallots?: PrintedBallot[]
  configuredAt?: ISO8601Timestamp
}

export interface Props extends RouteComponentProps {
  storage: Storage<AppStorage>
}

export const electionStorageKey = 'election'
export const cvrsStorageKey = 'cvrFiles'
export const isOfficialResultsKey = 'isOfficialResults'
export const printedBallotsStorageKey = 'printedBallots'
export const configuredAtStorageKey = 'configuredAt'

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
  const [configuredAt, setConfiguredAt] = useState<ISO8601Timestamp>('')

  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState(
    CastVoteRecordFiles.empty
  )
  const [isOfficialResults, setIsOfficialResults] = useState(false)

  const saveIsOfficialResults = async () => {
    setIsOfficialResults(true)
    await storage.set(isOfficialResultsKey, true)
  }

  const [usbStatus, setUsbStatus] = useState(UsbDriveStatus.absent)
  const [recentlyEjected, setRecentlyEjected] = useState(false)

  const doMountIfNotRecentlyEjected = useCallback(async () => {
    if (!recentlyEjected) {
      await doMount()
    }
  }, [recentlyEjected])

  const doEject = async () => {
    setRecentlyEjected(true)
    await doUnmount()
  }

  useInterval(
    () => {
      ;(async () => {
        const status = await usbDriveGetStatus()
        setUsbStatus(status)
        if (status === UsbDriveStatus.present) {
          await doMountIfNotRecentlyEjected()
        } else {
          setRecentlyEjected(false)
        }
      })()
    },
    usbStatus === UsbDriveStatus.notavailable ? false : 2000
  )

  const displayUsbStatus = recentlyEjected
    ? UsbDriveStatus.recentlyEjected
    : usbStatus

  const [printedBallots, setPrintedBallots] = useState<
    PrintedBallot[] | undefined
  >(undefined)

  const getPrintedBallots = async (): Promise<PrintedBallot[]> => {
    return (await storage.get(printedBallotsStorageKey)) || []
  }

  const savePrintedBallots = async (printedBallots: PrintedBallot[]) => {
    return await storage.set(printedBallotsStorageKey, printedBallots)
  }

  const addPrintedBallot = async (printedBallot: PrintedBallot) => {
    const ballots = await getPrintedBallots()
    ballots.push(printedBallot)
    await savePrintedBallots(ballots)
    setPrintedBallots(ballots)
  }

  useEffect(() => {
    ;(async () => {
      if (!printedBallots) {
        setPrintedBallots(await getPrintedBallots())
      }
    })()
  })

  useEffect(() => {
    ;(async () => {
      if (!election) {
        const storageElection = await getElection()
        if (storageElection) {
          setElection(storageElection)
          setElectionHash(sha256(JSON.stringify(storageElection)))

          setConfiguredAt((await storage.get(configuredAtStorageKey)) || '')
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
    if (newCVRFiles === CastVoteRecordFiles.empty) {
      setIsOfficialResults(false)
    }
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
    // we set a new election definition, reset everything
    storage.clear()
    setIsOfficialResults(false)
    setCastVoteRecordFiles(CastVoteRecordFiles.empty)
    setPrintedBallots([])

    setElection(electionDefinition)
    setElectionHash(
      electionDefinition ? sha256(JSON.stringify(electionDefinition)) : ''
    )
    if (electionDefinition) {
      storage.set(electionStorageKey, electionDefinition)
      const newConfiguredAt = new Date().toISOString()
      storage.set(configuredAtStorageKey, newConfiguredAt)
      setConfiguredAt(newConfiguredAt)
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        election,
        electionHash,
        configuredAt,
        isOfficialResults,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        setCastVoteRecordFiles,
        setVoteCounts,
        voteCounts,
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: doEject,
        printedBallots: printedBallots || [],
        addPrintedBallot,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
