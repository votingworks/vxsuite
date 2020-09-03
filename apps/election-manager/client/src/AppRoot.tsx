import { strict as assert } from 'assert'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useInterval } from 'use-interval'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { sha256 } from 'js-sha256'

import { parseElection } from '@votingworks/ballot-encoder'

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
  ElectionDefinition,
  SaveElection,
  OptionalVoteCounts,
  PrintedBallot,
  ISO8601Timestamp,
} from './config/types'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  cvrFiles?: string
  isOfficialResults?: boolean
  printedBallots?: PrintedBallot[]
  configuredAt?: ISO8601Timestamp
}

export interface Props extends RouteComponentProps {
  storage: Storage<AppStorage>
}

export const electionDefinitionStorageKey = 'electionDefinition'
export const cvrsStorageKey = 'cvrFiles'
export const isOfficialResultsKey = 'isOfficialResults'
export const printedBallotsStorageKey = 'printedBallots'
export const configuredAtStorageKey = 'configuredAt'

const AppRoot = ({ storage }: Props) => {
  const printBallotRef = useRef<HTMLDivElement>(null)

  const getElectionDefinition = useCallback(async () => {
    const electionDefinition = await storage.get(electionDefinitionStorageKey)

    if (electionDefinition) {
      const { electionData, electionHash } = electionDefinition
      assert.equal(sha256(electionData), electionHash)
      return electionDefinition
    }
  }, [storage])

  const getCVRFiles = async () => storage.get(cvrsStorageKey)
  const getIsOfficialResults = async () => storage.get(isOfficialResultsKey)

  const [electionDefinition, setElectionDefinition] = useState<
    ElectionDefinition
  >()
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
      if (!electionDefinition) {
        const storageElectionDefinition = await getElectionDefinition()
        if (storageElectionDefinition) {
          setElectionDefinition(storageElectionDefinition)
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

    if (newCVRFiles === CastVoteRecordFiles.empty) {
      storage.remove(cvrsStorageKey)
      storage.remove(isOfficialResultsKey)
      setIsOfficialResults(false)
    } else {
      storage.set(cvrsStorageKey, newCVRFiles.export())
    }
  }

  const [voteCounts, setVoteCounts] = useState<OptionalVoteCounts>()

  const saveElection: SaveElection = async (electionJSON) => {
    // we set a new election definition, reset everything
    storage.clear()
    setIsOfficialResults(false)
    setCastVoteRecordFiles(CastVoteRecordFiles.empty)
    setPrintedBallots([])
    setElectionDefinition(undefined)

    if (electionJSON) {
      const electionData = electionJSON
      const electionHash = sha256(electionData)
      const election = parseElection(JSON.parse(electionData))

      setElectionDefinition({
        electionData,
        electionHash,
        election,
      })

      const newConfiguredAt = new Date().toISOString()
      setConfiguredAt(newConfiguredAt)

      await storage.set(configuredAtStorageKey, newConfiguredAt)
      await storage.set(electionDefinitionStorageKey, {
        election,
        electionData,
        electionHash,
      })
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
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
