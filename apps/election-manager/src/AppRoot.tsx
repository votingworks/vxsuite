import { strict as assert } from 'assert'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { sha256 } from 'js-sha256'

import {
  ElectionDefinition,
  parseElection,
  safeParseElection,
  FullElectionExternalTally,
  ExternalTallySourceType,
  Optional,
  Provider,
} from '@votingworks/types'

import {
  Storage,
  throwIllegalValue,
  usbstick,
  Printer,
  Card,
  Hardware,
} from '@votingworks/utils'
import { useSmartcard, useUsbDrive } from '@votingworks/ui'
import { machineConfigProvider as machineConfigProviderFn } from './utils/machineConfig'
import {
  computeFullElectionTally,
  getEmptyFullElectionTally,
} from './lib/votecounting'

import AppContext from './contexts/AppContext'

import CastVoteRecordFiles, {
  SaveCastVoteRecordFiles,
} from './utils/CastVoteRecordFiles'

import ElectionManager from './components/ElectionManager'
import {
  SaveElection,
  PrintedBallot,
  ISO8601Timestamp,
  CastVoteRecordLists,
  ExportableTallies,
  ResultsFileType,
  UserSession,
  MachineConfig,
} from './config/types'
import { getExportableTallies } from './utils/exportableTallies'
import {
  convertExternalTalliesToStorageString,
  convertStorageStringToExternalTallies,
} from './utils/externalTallies'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  cvrFiles?: string
  isOfficialResults?: boolean
  printedBallots?: PrintedBallot[]
  configuredAt?: ISO8601Timestamp
  externalVoteTallies?: string
}

export interface Props extends RouteComponentProps {
  storage: Storage
  printer: Printer
  hardware: Hardware
  card: Card
  machineConfigProvider?: Provider<MachineConfig>
}

export const electionDefinitionStorageKey = 'electionDefinition'
export const cvrsStorageKey = 'cvrFiles'
export const isOfficialResultsKey = 'isOfficialResults'
export const printedBallotsStorageKey = 'printedBallots'
export const configuredAtStorageKey = 'configuredAt'
export const externalVoteTalliesFileStorageKey = 'externalVoteTallies'

const AppRoot = ({
  storage,
  printer,
  card,
  hardware,
  machineConfigProvider = machineConfigProviderFn,
}: Props): JSX.Element => {
  const printBallotRef = useRef<HTMLDivElement>(null)

  const getElectionDefinition = useCallback(async (): Promise<
    ElectionDefinition | undefined
  > => {
    // TODO: validate this with zod schema
    const electionDefinition = (await storage.get(
      electionDefinitionStorageKey
    )) as ElectionDefinition | undefined

    if (electionDefinition) {
      const { electionData, electionHash } = electionDefinition
      assert.equal(sha256(electionData), electionHash)
      return electionDefinition
    }
  }, [storage])

  const getCVRFiles = async (): Promise<string | undefined> =>
    // TODO: validate this with zod schema
    (await storage.get(cvrsStorageKey)) as string | undefined
  const getExternalElectionTallies = async (): Promise<string | undefined> =>
    // TODO: validate this with zod schema
    (await storage.get(externalVoteTalliesFileStorageKey)) as string | undefined
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

  const [fullElectionTally, setFullElectionTally] = useState(
    getEmptyFullElectionTally()
  )

  const [
    fullElectionExternalTallies,
    setFullElectionExternalTallies,
  ] = useState<FullElectionExternalTally[]>([])

  const [machineConfig, setMachineConfig] = useState<MachineConfig>({
    machineId: '0000',
    bypassAuthentication: false,
    codeVersion: '',
  })

  // Handle Machine Config
  useEffect(() => {
    void (async () => {
      try {
        const newMachineConfig = await machineConfigProvider.get()
        setMachineConfig(newMachineConfig)
      } catch {
        // Do nothing if machineConfig fails. Default values will be used.
      }
    })()
  }, [machineConfigProvider])

  const [currentUserSession, setCurrentUserSession] = useState<
    Optional<UserSession>
  >()
  const usbDrive = useUsbDrive()
  const displayUsbStatus = usbDrive.status ?? usbstick.UsbDriveStatus.absent

  const [smartcard] = useSmartcard({ card, hardware })
  useEffect(() => {
    void (async () => {
      if (machineConfig.bypassAuthentication && !currentUserSession) {
        setCurrentUserSession({
          type: 'admin',
          authenticated: true,
        })
      } else if (smartcard) {
        if (!currentUserSession?.authenticated && smartcard.data?.t) {
          setCurrentUserSession({
            type: smartcard.data.t,
            authenticated: false,
          })
        }
      } else if (currentUserSession && !currentUserSession.authenticated) {
        // If a card is removed when there is not an authenticated session, clear the session.
        setCurrentUserSession(undefined)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!smartcard, smartcard?.data, smartcard?.longValueExists, machineConfig])

  const attemptToAuthenticateUser = useCallback(
    (passcode: string): boolean => {
      // The card must be an admin card to authenticate
      if (smartcard?.data?.t !== 'admin') {
        return false
      }
      // There must be an expected passcode on the card to authenticate.
      if (!smartcard?.data.p) {
        return false
      }
      if (passcode === smartcard.data.p) {
        setCurrentUserSession((prev) => {
          return prev ? { ...prev, authenticated: true } : undefined
        })
        return true
      }
      return false
    },
    [smartcard]
  )

  const lockMachine = useCallback(() => {
    if (!machineConfig.bypassAuthentication) {
      setCurrentUserSession(undefined)
    }
  }, [machineConfig])

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

  const savePrintedBallots = async (printedBallotsToStore: PrintedBallot[]) => {
    return await storage.set(printedBallotsStorageKey, printedBallotsToStore)
  }

  const addPrintedBallot = async (printedBallot: PrintedBallot) => {
    const ballots = await getPrintedBallots()
    ballots.push(printedBallot)
    await savePrintedBallots(ballots)
    setPrintedBallots(ballots)
  }

  useEffect(() => {
    void (async () => {
      if (!printedBallots) {
        setPrintedBallots(await getPrintedBallots())
      }
    })()
  })

  useEffect(() => {
    void (async () => {
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
          fullElectionExternalTallies.length === 0 &&
          storageElectionDefinition
        ) {
          const storageExternalTalliesJSON = await getExternalElectionTallies()
          if (storageExternalTalliesJSON) {
            const importedData = convertStorageStringToExternalTallies(
              storageExternalTalliesJSON
            )
            setFullElectionExternalTallies(importedData)
          }
        }
      }
    })()
  })

  const computeVoteCounts = useCallback(
    (castVoteRecords: CastVoteRecordLists) => {
      assert(electionDefinition)
      setIsTabulationRunning(true)
      const fullTally = computeFullElectionTally(
        electionDefinition.election,
        castVoteRecords
      )
      setFullElectionTally(fullTally)
      setIsTabulationRunning(false)
    },
    [setFullElectionTally, electionDefinition]
  )

  useEffect(() => {
    if (electionDefinition) {
      computeVoteCounts(castVoteRecordFiles.castVoteRecords)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeVoteCounts, castVoteRecordFiles])

  const saveExternalTallies = async (
    externalTallies: FullElectionExternalTally[]
  ) => {
    setFullElectionExternalTallies(externalTallies)
    if (externalTallies.length > 0) {
      await storage.set(
        externalVoteTalliesFileStorageKey,
        convertExternalTalliesToStorageString(externalTallies)
      )
    } else {
      await storage.remove(externalVoteTalliesFileStorageKey)
    }
  }

  const saveCastVoteRecordFiles: SaveCastVoteRecordFiles = async (
    newCVRFiles = CastVoteRecordFiles.empty
  ) => {
    setCastVoteRecordFiles(newCVRFiles)
    if (newCVRFiles === CastVoteRecordFiles.empty) {
      setIsOfficialResults(false)
    }

    if (newCVRFiles === CastVoteRecordFiles.empty) {
      await storage.remove(cvrsStorageKey)
      await storage.remove(isOfficialResultsKey)
      setIsOfficialResults(false)
    } else {
      await storage.set(cvrsStorageKey, newCVRFiles.export())
    }
  }

  const saveElection: SaveElection = useCallback(
    async (electionJSON) => {
      // we set a new election definition, reset everything
      await storage.clear()
      setIsOfficialResults(false)
      setCastVoteRecordFiles(CastVoteRecordFiles.empty)
      setFullElectionExternalTallies([])
      setPrintedBallots([])
      setElectionDefinition(undefined)

      if (electionJSON) {
        const electionData = electionJSON
        const electionHash = sha256(electionData)
        const election = safeParseElection(electionData).unsafeUnwrap()

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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      storage,
      setIsOfficialResults,
      setCastVoteRecordFiles,
      setPrintedBallots,
      setElectionDefinition,
      parseElection,
      setElectionDefinition,
      setConfiguredAt,
    ]
  )

  const generateExportableTallies = (): ExportableTallies => {
    assert(electionDefinition)
    return getExportableTallies(
      fullElectionTally,
      fullElectionExternalTallies,
      electionDefinition.election
    )
  }

  const resetFiles = async (fileType: ResultsFileType) => {
    switch (fileType) {
      case ResultsFileType.CastVoteRecord:
        await saveCastVoteRecordFiles()
        break
      case ResultsFileType.SEMS: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.SEMS
        )
        await saveExternalTallies(newFiles)
        break
      }
      case ResultsFileType.Manual: {
        const newFiles = fullElectionExternalTallies.filter(
          (tally) => tally.source !== ExternalTallySourceType.Manual
        )
        await saveExternalTallies(newFiles)
        break
      }
      case ResultsFileType.All:
        await saveCastVoteRecordFiles()
        await saveExternalTallies([])
        break
      default:
        throwIllegalValue(fileType)
    }
  }

  return (
    <AppContext.Provider
      value={{
        castVoteRecordFiles,
        electionDefinition,
        configuredAt,
        isOfficialResults,
        printer,
        printBallotRef,
        saveCastVoteRecordFiles,
        saveElection,
        saveIsOfficialResults,
        setCastVoteRecordFiles,
        resetFiles,
        usbDriveStatus: displayUsbStatus,
        usbDriveEject: usbDrive.eject,
        printedBallots: printedBallots || [],
        addPrintedBallot,
        fullElectionTally,
        setFullElectionTally,
        fullElectionExternalTallies,
        saveExternalTallies,
        isTabulationRunning,
        setIsTabulationRunning,
        generateExportableTallies,
        currentUserSession,
        attemptToAuthenticateUser,
        lockMachine,
        machineConfig,
      }}
    >
      <ElectionManager />
      <div ref={printBallotRef} />
    </AppContext.Provider>
  )
}

export default AppRoot
