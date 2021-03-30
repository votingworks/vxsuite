import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useInterval } from 'use-interval'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'

import {
  ElectionDefinition,
  parseElection,
  safeParseElectionDefinition,
} from '@votingworks/types'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  doUnmount,
  UsbDriveStatus,
} from './lib/usbstick'
import {
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from './lib/votecounting'

import AppContext from './contexts/AppContext'

import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from './utils/CastVoteRecordFiles'
import { Storage } from './utils/Storage'

import ElectionManager from './components/ElectionManager'
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  FullElectionExternalTally,
  CastVoteRecordLists,
  OptionalFile,
} from './config/types'
import {
  convertFileToStorageString,
  convertStorageStringToFile,
} from './utils/file'
import { convertSEMSFileToExternalTally } from './utils/semsTallies'
import readFileAsync from './lib/readFileAsync'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  cvrFiles?: string
  isOfficialResults?: boolean
  printedBallots?: PrintedBallot[]
  configuredAt?: ISO8601Timestamp
  externalVoteRecordsFile?: string
}

export interface Props extends RouteComponentProps {
  storage: Storage
}

export const electionDefinitionStorageKey = 'electionDefinition'
export const cvrsStorageKey = 'cvrFiles'
export const isOfficialResultsKey = 'isOfficialResults'
export const printedBallotsStorageKey = 'printedBallots'
export const configuredAtStorageKey = 'configuredAt'
export const externalVoteRecordsFileStorageKey = 'externalVoteRecordsFile'

const AppRoot: React.FC<Props> = ({ storage }) => {
  const printBallotRef = useRef<HTMLDivElement>(null)

  const getElectionDefinition = useCallback(async (): Promise<
    ElectionDefinition | undefined
  > => {
    const electionDefinition = await storage.get(electionDefinitionStorageKey)

    if (electionDefinition) {
      return safeParseElectionDefinition(electionDefinition).unwrap()
    }
  }, [storage])

  const getCVRFiles = async (): Promise<string | undefined> =>
    // TODO: validate this with zod schema
    (await storage.get(cvrsStorageKey)) as string | undefined
  const getExternalFile = async (): Promise<string | undefined> =>
    // TODO: validate this with zod schema
    (await storage.get(externalVoteRecordsFileStorageKey)) as string | undefined
  const getIsOfficialResults = async (): Promise<boolean | undefined> =>
    // TODO: validate this with zod schema
    (await storage.get(isOfficialResultsKey)) as boolean | undefined

  const [
    electionDefinition,
    setElectionDefinition,
  ] = useState<ElectionDefinition>()
  const [configuredAt, setConfiguredAt] = useState<ISO8601Timestamp>('')

  const [castVoteRecordFiles, setCastVoteRecordFiles] = useState(
    CastVoteRecordFiles.empty
  )
  const [isTabulationRunning, setIsTabulationRunning] = useState(false)
  const [isOfficialResults, setIsOfficialResults] = useState(false)

  const saveIsOfficialResults = async () => {
    setIsOfficialResults(true)
    await storage.set(isOfficialResultsKey, true)
  }

  const [usbStatus, setUsbStatus] = useState(UsbDriveStatus.absent)
  const [recentlyEjected, setRecentlyEjected] = useState(false)

  const [fullElectionTally, setFullElectionTally] = useState(
    getEmptyFullElectionTally()
  )

  const [
    fullElectionExternalTally,
    setFullElectionExternalTally,
  ] = useState<FullElectionExternalTally>()
  const [externalVoteRecordsFile, setExternalVoteRecordsFile] = useState<File>()

  const doMountIfNotRecentlyEjected = useCallback(async () => {
    if (!recentlyEjected) {
      await doMount()
    }
  }, [recentlyEjected])

  const doEject = async () => {
    setUsbStatus(UsbDriveStatus.ejecting)
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

  const displayUsbStatus =
    recentlyEjected && usbStatus === UsbDriveStatus.present
      ? UsbDriveStatus.recentlyEjected
      : usbStatus

  const [printedBallots, setPrintedBallots] = useState<
    PrintedBallot[] | undefined
  >(undefined)

  const getPrintedBallots = async (): Promise<PrintedBallot[]> => {
    // TODO: validate this with zod schema
    return (
      ((await storage.get(printedBallotsStorageKey)) as
        | PrintedBallot[]
        | undefined) || []
    )
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
          setConfiguredAt(
            // TODO: validate this with zod schema
            ((await storage.get(configuredAtStorageKey)) as
              | string
              | undefined) || ''
          )
        }

        if (castVoteRecordFiles === CastVoteRecordFiles.empty) {
          const storageCVRFiles = await getCVRFiles()
          if (storageCVRFiles) {
            setCastVoteRecordFiles(CastVoteRecordFiles.import(storageCVRFiles))
            setIsOfficialResults((await getIsOfficialResults()) || false)
          }
        }

        if (
          fullElectionExternalTally === undefined &&
          storageElectionDefinition
        ) {
          const storageExternalFileJSON = await getExternalFile()
          if (storageExternalFileJSON) {
            const importedData = convertStorageStringToFile(
              storageExternalFileJSON
            )
            if (importedData) {
              const file = importedData
              setExternalVoteRecordsFile(file)
            }
          }
        }
      }
    })()
  })

  const computeVoteCounts = useCallback(
    (castVoteRecords: CastVoteRecordLists) => {
      setIsTabulationRunning(true)
      const fullTally = computeFullElectionTally(
        electionDefinition!.election,
        castVoteRecords
      )
      setFullElectionTally(fullTally)
      setIsTabulationRunning(false)
    },
    [setFullElectionTally, electionDefinition]
  )

  const computeExternalVoteCounts = useCallback(
    async (externalVoteRecordsFile: OptionalFile) => {
      if (externalVoteRecordsFile) {
        setIsTabulationRunning(true)
        const fileContent = await readFileAsync(externalVoteRecordsFile)
        const externalTally = convertSEMSFileToExternalTally(
          fileContent,
          electionDefinition!.election
        )
        setFullElectionExternalTally(externalTally)
        setIsTabulationRunning(false)
      } else {
        setFullElectionExternalTally(undefined)
      }
    },
    [setFullElectionExternalTally, electionDefinition]
  )

  useEffect(() => {
    if (electionDefinition) {
      computeVoteCounts(castVoteRecordFiles.castVoteRecords)
    }
  }, [computeVoteCounts, castVoteRecordFiles])

  useEffect(() => {
    if (electionDefinition) {
      computeExternalVoteCounts(externalVoteRecordsFile)
    }
  }, [computeExternalVoteCounts, externalVoteRecordsFile])

  const saveExternalVoteRecordsFile = async (
    externalVoteRecordsFile: File | undefined
  ) => {
    if (externalVoteRecordsFile) {
      setExternalVoteRecordsFile(externalVoteRecordsFile)
      const storageString = await convertFileToStorageString(
        externalVoteRecordsFile
      )
      storage.set(externalVoteRecordsFileStorageKey, storageString)
    } else {
      setExternalVoteRecordsFile(undefined)
      storage.remove(externalVoteRecordsFileStorageKey)
    }
  }

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

  const saveElection: SaveElection = useCallback(
    async (electionJSON) => {
      // we set a new election definition, reset everything
      storage.clear()
      setIsOfficialResults(false)
      setCastVoteRecordFiles(CastVoteRecordFiles.empty)
      setExternalVoteRecordsFile(undefined)
      setPrintedBallots([])
      setElectionDefinition(undefined)

      if (electionJSON) {
        const electionDefinition = safeParseElectionDefinition(
          electionJSON
        ).unwrap()
        setElectionDefinition(electionDefinition)

        const newConfiguredAt = new Date().toISOString()
        setConfiguredAt(newConfiguredAt)

        await storage.set(configuredAtStorageKey, newConfiguredAt)
        await storage.set(electionDefinitionStorageKey, electionDefinition)
      }
    },
    [
      storage,
      setIsOfficialResults,
      setCastVoteRecordFiles,
      setExternalVoteRecordsFile,
      setPrintedBallots,
      setElectionDefinition,
      parseElection,
      setElectionDefinition,
      setConfiguredAt,
    ]
  )

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
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: doEject,
        printedBallots: printedBallots || [],
        addPrintedBallot,
        fullElectionTally,
        setFullElectionTally,
        fullElectionExternalTally,
        externalVoteRecordsFile,
        saveExternalVoteRecordsFile,
        setFullElectionExternalTally,
        isTabulationRunning,
        setIsTabulationRunning,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
