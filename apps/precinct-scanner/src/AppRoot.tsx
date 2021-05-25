import { ScannerStatus } from '@votingworks/types/api/module-scan'
import React, { useCallback, useEffect, useReducer } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import useInterval from '@rooks/use-interval'
import 'normalize.css'
import { map } from 'rxjs/operators'
import makeDebug from 'debug'

import {
  AdjudicationReason,
  AdminCardData,
  CardData,
  OptionalElectionDefinition,
  PollworkerCardData,
  Provider,
} from '@votingworks/types'
import { sleep, PrecinctScannerCardTally } from '@votingworks/utils'

import UnconfiguredElectionScreen from './screens/UnconfiguredElectionScreen'
import LoadingConfigurationScreen from './screens/LoadingConfigurationScreen'
import { Hardware, isCardReader } from './utils/Hardware'
import {
  CardPresentAPI,
  BallotState,
  ScanningResultType,
  RejectedScanningReason,
  CastVoteRecord,
  MachineConfig,
} from './config/types'
import {
  CARD_POLLING_INTERVAL,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  POLLING_INTERVAL_FOR_USB,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
  STATUS_POLLING_EXTRA_CHECKS,
} from './config/globals'
import {
  getStatus as usbDriveGetStatus,
  doMount,
  doUnmount,
  UsbDriveStatus,
} from './utils/usbstick'

import * as config from './api/config'
import * as scan from './api/scan'
import throwIllegalValue from './utils/throwIllegalValue'

import { Card } from './utils/Card'
import { Storage } from './utils/Storage'

import AdminScreen from './screens/AdminScreen'
import SetupCardReaderPage from './screens/SetupCardReaderPage'
import InvalidCardScreen from './screens/InvalidCardScreen'
import PollsClosedScreen from './screens/PollsClosedScreen'
import PollWorkerScreen from './screens/PollWorkerScreen'
import InsertBallotScreen from './screens/InsertBallotScreen'
import ScanErrorScreen from './screens/ScanErrorScreen'
import ScanSuccessScreen from './screens/ScanSuccessScreen'
import ScanWarningScreen from './screens/ScanWarningScreen'
import ScanProcessingScreen from './screens/ScanProcessingScreen'
import useCancelablePromise from './hooks/useCancelablePromise'
import AppContext from './contexts/AppContext'

const debug = makeDebug('precinct-scanner:app-root')

export interface AppStorage {
  state?: Partial<State>
}

export const stateStorageKey = 'state'

export interface Props extends RouteComponentProps {
  hardware: Hardware
  card: Card
  storage: Storage
  machineConfig: Provider<MachineConfig>
}

interface HardwareState {
  hasCardReaderAttached: boolean
  hasPrinterAttached: boolean
  usbDriveStatus: UsbDriveStatus
  usbRecentlyEjected: boolean
  adminCardElectionHash: string
  isAdminCardPresent: boolean
  isPollWorkerCardPresent: boolean
  invalidCardPresent: boolean
  lastCardDataString: string
  machineConfig: Readonly<MachineConfig>
}

interface ScanInformationState {
  adjudicationReasons: AdjudicationReason[]
  rejectionReason?: RejectedScanningReason
}

interface SharedState {
  electionDefinition: OptionalElectionDefinition
  isScannerConfigured: boolean
  isTestMode: boolean
  scannedBallotCount: number
  ballotState: BallotState
  timeoutToInsertScreen?: number
  isStatusPollingEnabled: boolean
  currentPrecinctId?: string
  isPollsOpen: boolean
}

export interface State
  extends HardwareState,
    SharedState,
    ScanInformationState {}

const initialHardwareState: Readonly<HardwareState> = {
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  usbDriveStatus: UsbDriveStatus.absent,
  usbRecentlyEjected: false,
  adminCardElectionHash: '',
  isAdminCardPresent: false,
  isPollWorkerCardPresent: false,
  invalidCardPresent: false,
  lastCardDataString: '',
  machineConfig: { machineId: '0000', codeVersion: 'dev' },
}

const initialSharedState: Readonly<SharedState> = {
  electionDefinition: undefined,
  isScannerConfigured: false,
  isTestMode: false,
  scannedBallotCount: 0,
  ballotState: BallotState.IDLE,
  isStatusPollingEnabled: true,
  currentPrecinctId: undefined,
  isPollsOpen: false,
}

const initialScanInformationState: Readonly<ScanInformationState> = {
  adjudicationReasons: [],
  rejectionReason: undefined,
}

const initialAppState: Readonly<State> = {
  ...initialHardwareState,
  ...initialSharedState,
  ...initialScanInformationState,
}

// Sets State.
type AppAction =
  | { type: 'initializeAppState'; isPollsOpen: boolean }
  | { type: 'unconfigureScanner' }
  | {
      type: 'updateElectionDefinition'
      electionDefinition: OptionalElectionDefinition
    }
  | {
      type: 'updateUsbDriveStatus'
      usbDriveStatus: UsbDriveStatus
      usbRecentlyEjected?: boolean
    }
  | {
      type: 'refreshConfigFromScanner'
      electionDefinition: OptionalElectionDefinition
      isTestMode: boolean
      currentPrecinctId?: string
      ballotCount: number
    }
  | {
      type: 'ballotScanning'
      ballotCount?: number
    }
  | {
      type: 'ballotCast'
      timeoutToInsertScreen: number
    }
  | {
      type: 'ballotNeedsReview'
      adjudicationReasons: AdjudicationReason[]
    }
  | {
      type: 'ballotRejected'
      rejectionReason?: RejectedScanningReason
    }
  | {
      type: 'scannerError'
      timeoutToInsertScreen: number
      ballotCount?: number
    }
  | {
      type: 'readyToInsertBallot'
      ballotCount?: number
    }
  | {
      type: 'updateBallotCount'
      ballotCount: number
    }
  | { type: 'disableStatusPolling' }
  | { type: 'enableStatusPolling' }
  | { type: 'updateHardwareState'; hasCardReaderAttached: boolean }
  | {
      type: 'invalidCard'
    }
  | {
      type: 'processAdminCard'
      electionHash: string
    }
  | {
      type: 'processPollWorkerCard'
      isPollWorkerCardValid: boolean
    }
  | { type: 'updateLastCardDataString'; currentCardDataString: string }
  | { type: 'cardRemoved' }
  | { type: 'updatePrecinctId'; precinctId?: string }
  | { type: 'togglePollsOpen' }
  | { type: 'setMachineConfig'; machineConfig: MachineConfig }

const appReducer = (state: State, action: AppAction): State => {
  debug(
    '%cReducer "%s"',
    'color: green',
    action.type,
    { ...action, electionDefinition: undefined },
    {
      ...state,
      electionDefinition: undefined,
    }
  )
  switch (action.type) {
    case 'initializeAppState':
      return {
        ...state,
        isPollsOpen: action.isPollsOpen,
      }
    case 'updateUsbDriveStatus':
      return {
        ...state,
        usbDriveStatus: action.usbDriveStatus,
        usbRecentlyEjected: action.usbRecentlyEjected
          ? action.usbRecentlyEjected
          : state.usbRecentlyEjected,
      }
    case 'updateElectionDefinition':
      return {
        ...state,
        electionDefinition: action.electionDefinition,
      }
    case 'refreshConfigFromScanner':
      return {
        ...state,
        electionDefinition: action.electionDefinition,
        currentPrecinctId: action.currentPrecinctId,
        isTestMode: action.isTestMode,
        scannedBallotCount: action.ballotCount,
        isScannerConfigured: true,
      }
    case 'unconfigureScanner':
      return {
        ...state,
        isScannerConfigured: false,
      }
    case 'ballotScanning':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.SCANNING,
        timeoutToInsertScreen: undefined,
        scannedBallotCount:
          action.ballotCount === undefined
            ? state.scannedBallotCount
            : action.ballotCount,
      }
    case 'ballotCast':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.CAST,
        timeoutToInsertScreen: action.timeoutToInsertScreen,
      }
    case 'scannerError':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.SCANNER_ERROR,
        timeoutToInsertScreen: action.timeoutToInsertScreen,
        scannedBallotCount:
          action.ballotCount === undefined
            ? state.scannedBallotCount
            : action.ballotCount,
      }
    case 'ballotRejected':
      return {
        ...state,
        ...initialScanInformationState,
        rejectionReason: action.rejectionReason,
        ballotState: BallotState.REJECTED,
      }
    case 'ballotNeedsReview':
      return {
        ...state,
        ...initialScanInformationState,
        adjudicationReasons: action.adjudicationReasons,
        ballotState: BallotState.NEEDS_REVIEW,
      }
    case 'readyToInsertBallot':
      return {
        ...state,
        ...initialScanInformationState,
        ballotState: BallotState.IDLE,
        scannedBallotCount:
          action.ballotCount === undefined
            ? state.scannedBallotCount
            : action.ballotCount,
        timeoutToInsertScreen: undefined,
      }
    case 'updateBallotCount':
      return {
        ...state,
        scannedBallotCount: action.ballotCount,
      }
    case 'disableStatusPolling':
      return {
        ...state,
        isStatusPollingEnabled: false,
      }
    case 'enableStatusPolling':
      return {
        ...state,
        isStatusPollingEnabled: true,
      }
    case 'updateHardwareState':
      return {
        ...state,
        hasCardReaderAttached: action.hasCardReaderAttached,
      }
    case 'invalidCard':
      return {
        ...state,
        invalidCardPresent: true,
      }
    case 'processAdminCard':
      return {
        ...state,
        isAdminCardPresent: true,
        adminCardElectionHash: action.electionHash,
      }
    case 'processPollWorkerCard':
      return {
        ...state,
        isPollWorkerCardPresent: true,
        invalidCardPresent: !action.isPollWorkerCardValid,
      }
    case 'updateLastCardDataString': {
      return {
        ...state,
        lastCardDataString: action.currentCardDataString,
      }
    }
    case 'cardRemoved':
      return {
        ...state,
        isAdminCardPresent: false,
        invalidCardPresent: false,
        isPollWorkerCardPresent: false,
      }
    case 'updatePrecinctId':
      return {
        ...state,
        currentPrecinctId: action.precinctId,
      }
    case 'togglePollsOpen':
      return {
        ...state,
        isPollsOpen: !state.isPollsOpen,
      }
    case 'setMachineConfig':
      return {
        ...state,
        machineConfig:
          action.machineConfig ?? initialHardwareState.machineConfig,
      }
  }
}

const AppRoot: React.FC<Props> = ({
  hardware,
  card,
  storage,
  machineConfig: machineConfigProvider,
}) => {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    usbDriveStatus,
    electionDefinition,
    isScannerConfigured,
    ballotState,
    scannedBallotCount,
    timeoutToInsertScreen,
    isStatusPollingEnabled,
    adjudicationReasons,
    rejectionReason,
    isTestMode,
    hasCardReaderAttached,
    isAdminCardPresent,
    lastCardDataString,
    invalidCardPresent,
    currentPrecinctId,
    isPollsOpen,
    isPollWorkerCardPresent,
    machineConfig,
    usbRecentlyEjected,
  } = appState

  const usbDriveDisplayStatus =
    usbRecentlyEjected && usbDriveStatus !== UsbDriveStatus.ejecting
      ? UsbDriveStatus.recentlyEjected
      : usbDriveStatus

  const hasCardInserted =
    isAdminCardPresent || invalidCardPresent || isPollWorkerCardPresent
  const makeCancelable = useCancelablePromise()

  const refreshConfig = useCallback(async () => {
    const electionDefinition = await makeCancelable(
      config.getElectionDefinition()
    )
    const isTestMode = await makeCancelable(config.getTestMode())
    const currentPrecinctId = await makeCancelable(
      config.getCurrentPrecinctId()
    )
    // Get the ballot count off module-scan
    const { ballotCount } = await makeCancelable(scan.getCurrentStatus())
    dispatchAppState({
      type: 'refreshConfigFromScanner',
      electionDefinition,
      isTestMode,
      currentPrecinctId,
      ballotCount,
    })
  }, [dispatchAppState])

  const dismissCurrentBallotMessage = useCallback((): number => {
    return window.setTimeout(
      () => dispatchAppState({ type: 'readyToInsertBallot' }),
      TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS
    )
  }, [dispatchAppState])

  // Handle Machine Config
  useEffect(() => {
    const setMachineConfig = async () => {
      try {
        const newMachineConfig = await machineConfigProvider.get()
        dispatchAppState({
          type: 'setMachineConfig',
          machineConfig: newMachineConfig,
        })
      } catch {
        // Do nothing if machineConfig fails. Default values will be used.
      }
    }
    setMachineConfig()
  }, [machineConfigProvider])

  const scanDetectedBallot = useCallback(async () => {
    dispatchAppState({ type: 'disableStatusPolling' })
    try {
      const scanningResult = await scan.scanDetectedSheet()
      switch (scanningResult.resultType) {
        case ScanningResultType.Rejected: {
          dispatchAppState({
            type: 'ballotRejected',
            rejectionReason: scanningResult.rejectionReason,
          })
          break
        }
        case ScanningResultType.NeedsReview:
          dispatchAppState({
            type: 'ballotNeedsReview',
            adjudicationReasons: scanningResult.adjudicationReasons,
          })
          break
        case ScanningResultType.Accepted: {
          dispatchAppState({
            type: 'ballotCast',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
          })
          break
        }
        /* istanbul ignore next */
        default:
          throwIllegalValue(scanningResult)
      }
    } catch (error) {
      /* istanbul ignore next */
      dispatchAppState({
        type: 'ballotRejected',
      })
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      })
    }
  }, [dispatchAppState, dismissCurrentBallotMessage])

  const acceptBallot = useCallback(async () => {
    try {
      dispatchAppState({
        type: 'disableStatusPolling',
      })
      dispatchAppState({
        type: 'ballotScanning',
      })
      const success = await scan.acceptBallotAfterReview()
      if (success) {
        dispatchAppState({
          type: 'ballotCast',
          timeoutToInsertScreen: dismissCurrentBallotMessage(),
        })
      } else {
        dispatchAppState({
          type: 'ballotRejected',
        })
      }
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      })
    }
  }, [dispatchAppState, dismissCurrentBallotMessage])

  const endBatch = useCallback(async () => {
    dispatchAppState({ type: 'disableStatusPolling' })
    try {
      await scan.endBatch()
    } finally {
      dispatchAppState({
        type: 'enableStatusPolling',
      })
    }
  }, [dispatchAppState])

  const usbStatusInterval = useInterval(
    async () => {
      const status = await usbDriveGetStatus()
      if (status !== usbDriveStatus) {
        dispatchAppState({
          type: 'updateUsbDriveStatus',
          usbDriveStatus: status,
        })
      }
      /* istanbul ignore next */
      if (status === UsbDriveStatus.present && !usbRecentlyEjected) {
        await doMount()
      }
    },
    /* istanbul ignore next */
    usbDriveStatus === UsbDriveStatus.notavailable
      ? null
      : POLLING_INTERVAL_FOR_USB,
    true
  )

  const usbDriveEject = async () => {
    dispatchAppState({
      type: 'updateUsbDriveStatus',
      usbDriveStatus: UsbDriveStatus.ejecting,
      usbRecentlyEjected: true,
    })
    await doUnmount()
  }

  const [startBallotStatusPolling, endBallotStatusPolling] = useInterval(
    async () => {
      if (!isStatusPollingEnabled) {
        return
      }
      dispatchAppState({ type: 'disableStatusPolling' })

      try {
        const { scannerState, ballotCount } = await scan.getCurrentStatus()

        // The scanner can occasionally be very briefly in an unexpected state, we should make sure that the scanner stays in the current
        // state for 200ms before making any changes.
        for (let i = 0; i < STATUS_POLLING_EXTRA_CHECKS; i++) {
          await sleep(100)
          const { scannerState: scannerStateAgain } = await makeCancelable(
            scan.getCurrentStatus()
          )
          // If the state has already changed, abort and start the polling again.
          if (scannerStateAgain !== scannerState) {
            debug('saw a momentary blip in scanner status, aborting: %O', {
              firstStatus: scannerState,
              nextStatus: scannerStateAgain,
            })
            dispatchAppState({ type: 'enableStatusPolling' })
            return
          }
        }
        dispatchAppState({ type: 'enableStatusPolling' })

        const isCapableOfBeginningNewScan =
          ballotState === BallotState.IDLE ||
          ballotState === BallotState.CAST ||
          ballotState === BallotState.SCANNER_ERROR

        const isHoldingPaperForVoterRemoval =
          ballotState === BallotState.REJECTED ||
          ballotState === BallotState.NEEDS_REVIEW

        debug({
          scannerState,
          ballotCount,
          ballotState,
          isCapableOfBeginningNewScan,
          isHoldingPaperForVoterRemoval,
        })

        // Figure out what ballot state we are in, defaulting to the current state.
        switch (scannerState) {
          case ScannerStatus.Error:
          case ScannerStatus.Unknown: {
            // The scanner returned an error move to the error screen. Assume there is not currently paper in the scanner.
            // TODO(531) Bugs in module-scan make this happen at confusing moments, ignore for now.
            debug('got a bad scanner status', scannerState)
            /* dispatchAppState({
            type: 'scannerError',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
            ballotCount,
          }) */
            return
          }
          case ScannerStatus.ReadyToScan:
            if (isCapableOfBeginningNewScan) {
              // If we are going to reset the machine back to the insert ballot screen, cancel that.
              if (timeoutToInsertScreen) {
                window.clearTimeout(timeoutToInsertScreen)
              }
              // begin scanning
              dispatchAppState({
                type: 'ballotScanning',
                ballotCount,
              })
              await scanDetectedBallot()
            }
            return
          case ScannerStatus.WaitingForPaper:
            // When we can not begin a new scan we are not expecting to be waiting for paper
            // This will happen if someone is ripping the paper out of the scanner while scanning, or reviewing
            // a ballot.
            if (isHoldingPaperForVoterRemoval) {
              // The voter has removed the ballot, end the batch and reset to the insert screen.
              await endBatch()
              /* istanbul ignore next */
              if (timeoutToInsertScreen) {
                window.clearTimeout(timeoutToInsertScreen)
              }
              dispatchAppState({ type: 'readyToInsertBallot', ballotCount })
              return
            }
        }
        if (ballotCount !== scannedBallotCount) {
          dispatchAppState({ type: 'updateBallotCount', ballotCount })
        }
      } catch (err) {
        debug('error in fetching module scan status')
        dispatchAppState({ type: 'enableStatusPolling' })
      }
    },
    POLLING_INTERVAL_FOR_SCANNER_STATUS_MS
  )
  const startUsbStatusPolling = useCallback(usbStatusInterval[0], [])
  const stopUsbStatusPolling = useCallback(usbStatusInterval[0], [])

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshConfig()
      } catch (e) {
        debug('failed to initialize:', e)
        dispatchAppState({
          type: 'unconfigureScanner',
        })
        endBallotStatusPolling()
        window.setTimeout(initialize, 1000)
      }
    }

    initialize()
  }, [refreshConfig])

  useEffect(() => {
    if (
      isScannerConfigured &&
      electionDefinition &&
      isPollsOpen &&
      !hasCardInserted
    ) {
      startBallotStatusPolling()
    } else {
      endBallotStatusPolling()
    }
  }, [isScannerConfigured, electionDefinition, isPollsOpen, hasCardInserted])

  const setElectionDefinition = useCallback(
    async (electionDefinition: OptionalElectionDefinition) => {
      dispatchAppState({ type: 'updateElectionDefinition', electionDefinition })
      await refreshConfig()
    },
    [dispatchAppState, refreshConfig]
  )

  const toggleTestMode = useCallback(async () => {
    await config.setTestMode(!isTestMode)
    await refreshConfig()
  }, [dispatchAppState, refreshConfig, isTestMode])

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined)
      endBallotStatusPolling()
      await refreshConfig()
    } catch (error) {
      debug('failed unconfigureServer()', error)
    }
  }, [dispatchAppState, refreshConfig])

  const processCard = useCallback(
    async ({ longValueExists, shortValue: cardShortValue }: CardPresentAPI) => {
      const cardData: CardData = JSON.parse(cardShortValue!)
      if (!electionDefinition && cardData.t !== 'admin') {
        return
      }
      switch (cardData.t) {
        case 'voter': {
          dispatchAppState({
            type: 'invalidCard',
          })
          break
        }
        case 'pollworker': {
          const isValid =
            (cardData as PollworkerCardData).h ===
            electionDefinition?.electionHash

          dispatchAppState({
            type: 'processPollWorkerCard',
            isPollWorkerCardValid: isValid,
          })
          break
        }
        case 'admin': {
          /* istanbul ignore else */
          if (longValueExists) {
            dispatchAppState({
              type: 'processAdminCard',
              electionHash: (cardData as AdminCardData).h,
            })
          }
          break
        }
        default: {
          dispatchAppState({
            type: 'invalidCard',
          })
          break
        }
      }
    },
    [card, electionDefinition]
  )

  const cardShortValueReadInterval = useInterval(async () => {
    if (!hasCardReaderAttached) {
      return
    }
    const insertedCard = await card.readStatus()

    // we compare last card and current card without the longValuePresent flag
    // otherwise when we first write the ballot to the card, it reprocesses it
    // and may cause a race condition where an old ballot on the card
    // overwrites a newer one in memory.
    //
    // TODO: embed a card dip UUID in the card data string so even an unlikely
    // identical card swap within 200ms is always detected.
    // https://github.com/votingworks/module-smartcards/issues/59
    const cardCopy = {
      ...insertedCard,
      longValueExists: undefined, // override longValueExists (see above comment)
    }
    const currentCardDataString = JSON.stringify(cardCopy)
    if (currentCardDataString === lastCardDataString) {
      return
    }

    dispatchAppState({
      type: 'updateLastCardDataString',
      currentCardDataString,
    })

    if (insertedCard.present) {
      processCard(insertedCard)
    } else if (hasCardInserted) {
      dispatchAppState({ type: 'cardRemoved' })
    }
  }, CARD_POLLING_INTERVAL)
  const startCardShortValueReadPolling = useCallback(
    cardShortValueReadInterval[0],
    [card]
  )
  const stopCardShortValueReadPolling = useCallback(
    cardShortValueReadInterval[1],
    [card]
  )

  const getCVRsFromExport = useCallback(async (): Promise<CastVoteRecord[]> => {
    if (electionDefinition) {
      return await scan.getExport()
    }
    return []
  }, [electionDefinition, scannedBallotCount])

  const saveTallyToCard = useCallback(
    async (cardTally: PrecinctScannerCardTally) => {
      await card.writeLongObject(cardTally)
    },
    [card]
  )

  useEffect(() => {
    const hardwareStatusSubscription = hardware.devices
      .pipe(map((devices) => Array.from(devices)))
      .subscribe(async (devices) => {
        const hasCardReaderAttached = devices.some(isCardReader)
        dispatchAppState({
          type: 'updateHardwareState',
          hasCardReaderAttached,
        })
      })
    return () => {
      hardwareStatusSubscription.unsubscribe()
    }
  }, [hardware])

  // Initialize app state
  useEffect(() => {
    const updateStateFromStorage = async () => {
      const storedAppState: Partial<State> =
        ((await storage.get(stateStorageKey)) as Partial<State> | undefined) ||
        {}
      const { isPollsOpen = initialAppState.isPollsOpen } = storedAppState
      dispatchAppState({
        type: 'initializeAppState',
        isPollsOpen,
      })
    }

    updateStateFromStorage()
    startUsbStatusPolling()
    startCardShortValueReadPolling()
    return () => {
      stopCardShortValueReadPolling()
      stopUsbStatusPolling()
    }
  }, [startUsbStatusPolling, startCardShortValueReadPolling, storage])

  const updatePrecinctId = useCallback(
    async (precinctId: string) => {
      dispatchAppState({ type: 'updatePrecinctId', precinctId })
      await config.setCurrentPrecinctId(precinctId)
    },
    [dispatchAppState]
  )

  const togglePollsOpen = useCallback(() => {
    dispatchAppState({ type: 'togglePollsOpen' })
  }, [])

  useEffect(() => {
    const storeAppState = () => {
      storage.set(stateStorageKey, {
        isPollsOpen,
      })
    }

    storeAppState()
  }, [isPollsOpen])

  const dismissError = () => {
    /* istanbul ignore next */
    if (timeoutToInsertScreen) {
      window.clearTimeout(timeoutToInsertScreen)
    }
    dispatchAppState({ type: 'readyToInsertBallot' })
  }

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />
  }

  if (!isScannerConfigured) {
    return <LoadingConfigurationScreen />
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveDisplayStatus}
        setElectionDefinition={setElectionDefinition}
      />
    )
  }

  if (invalidCardPresent) {
    return <InvalidCardScreen />
  }

  if (isAdminCardPresent) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
        }}
      >
        <AdminScreen
          updateAppPrecinctId={updatePrecinctId}
          scannedBallotCount={scannedBallotCount}
          isTestMode={isTestMode}
          toggleLiveMode={toggleTestMode}
          unconfigure={unconfigureServer}
          calibrate={scan.calibrate}
          usbDriveStatus={usbDriveDisplayStatus}
          usbDriveEject={usbDriveEject}
        />
      </AppContext.Provider>
    )
  }

  if (isPollWorkerCardPresent) {
    return (
      <AppContext.Provider
        value={{
          electionDefinition,
          currentPrecinctId,
          machineConfig,
        }}
      >
        <PollWorkerScreen
          ballotsScannedCount={scannedBallotCount}
          isPollsOpen={isPollsOpen}
          togglePollsOpen={togglePollsOpen}
          saveTallyToCard={saveTallyToCard}
          getCVRsFromExport={getCVRsFromExport}
          isLiveMode={!isTestMode}
        />
      </AppContext.Provider>
    )
  }

  let voterScreen = (
    <PollsClosedScreen electionDefinition={electionDefinition} />
  )

  // The polls are open for voters to utilize.
  if (isPollsOpen) {
    switch (ballotState) {
      case BallotState.IDLE: {
        voterScreen = (
          <InsertBallotScreen scannedBallotCount={scannedBallotCount} />
        )
        break
      }
      case BallotState.SCANNING: {
        voterScreen = <ScanProcessingScreen />
        break
      }
      case BallotState.NEEDS_REVIEW: {
        voterScreen = (
          <ScanWarningScreen
            acceptBallot={acceptBallot}
            adjudicationReasons={adjudicationReasons}
          />
        )
        break
      }
      case BallotState.CAST: {
        voterScreen = (
          <ScanSuccessScreen scannedBallotCount={scannedBallotCount} />
        )
        break
      }
      case BallotState.SCANNER_ERROR: {
        voterScreen = (
          <ScanErrorScreen
            dismissError={dismissError}
            isTestMode={isTestMode}
          />
        )
        break
      }
      case BallotState.REJECTED: {
        voterScreen = (
          <ScanErrorScreen
            rejectionReason={rejectionReason}
            isTestMode={isTestMode}
          />
        )
        break
      }
      /* istanbul ignore next */
      default:
        throwIllegalValue(ballotState)
    }
  }
  return (
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig,
        currentPrecinctId,
      }}
    >
      {voterScreen}
    </AppContext.Provider>
  )
}

export default AppRoot
