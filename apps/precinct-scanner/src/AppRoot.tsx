import { ScannerStatus } from '@votingworks/types/api/module-scan'
import React, { useCallback, useEffect, useReducer } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import useInterval from '@rooks/use-interval'
import 'normalize.css'
import { map } from 'rxjs/operators'

import {
  AdjudicationReason,
  AdminCardData,
  CardData,
  ElectionDefinition,
  OptionalElectionDefinition,
} from '@votingworks/types'
import UnconfiguredElectionScreen from './screens/UnconfiguredElectionScreen'
import LoadingConfigurationScreen from './screens/LoadingConfigurationScreen'
import { Hardware, isCardReader } from './utils/Hardware'
import {
  CardPresentAPI,
  BallotState,
  ScanningResultType,
  ISO8601Timestamp,
  RejectedScanningReason,
} from './config/types'
import {
  CARD_POLLING_INTERVAL,
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  POLLING_INTERVAL_FOR_USB,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
} from './config/globals'

import AdminScreen from './screens/AdminScreen'
import SetupCardReaderPage from './screens/SetupCardReaderPage'
import InvalidCardScreen from './screens/InvalidCardScreen'
// import InsertBallotScreen from './screens/InsertBallotScreen'
// import PollsClosedScreen from './screens/PollsClosedScreen'
// import PollWorkerScreen from './screens/PollWorkerScreen'
// <PollWorkerScreen
//   appPrecinctId="42"
//   ballotsScannedCount={42}
//   electionDefinition={electionDefinition}
//   isPollsOpen={false}
//   togglePollsOpen={() => {}}
// />

// import ScanErrorScreen from './screens/ScanErrorScreen'
// import ScanSuccessScreen from './screens/ScanSuccessScreen'
// import ScanWarningScreen from './screens/ScanWarningScreen'
import InsertBallotScreen from './screens/InsertBallotScreen'
// import PollsClosedScreen from './screens/PollsClosedScreen'
// import PollWorkerScreen from './screens/PollWorkerScreen'
import ScanErrorScreen from './screens/ScanErrorScreen'
import ScanSuccessScreen from './screens/ScanSuccessScreen'
import ScanWarningScreen from './screens/ScanWarningScreen'
// import BallotScanningScreen from './screens/BallotScanningScreen'
import ScanProcessingScreen from './screens/ScanProcessingScreen'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  UsbDriveStatus,
} from './utils/usbstick'

import * as config from './api/config'
import * as scan from './api/scan'
import throwIllegalValue from './utils/throwIllegalValue'

import { Card } from './utils/Card'
import LoadingScreen from './screens/LoadingScreen'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  configuredAt?: ISO8601Timestamp
}

export interface Props extends RouteComponentProps {
  hardware: Hardware
  card: Card
}

interface HardwareState {
  hasCardReaderAttached: boolean
  hasPrinterAttached: boolean
  usbDriveStatus: UsbDriveStatus
  adminCardElectionHash: string
  isAdminCardPresent: boolean
  invalidCardPresent: boolean
  lastCardDataString: string
  // machineConfig: Readonly<MachineConfig>
}

interface SharedState {
  electionDefinition: OptionalElectionDefinition
  isScannerConfigured: boolean
  isTestMode: boolean
  scannedBallotCount: number
  ballotState: BallotState
  timeoutToInsertScreen?: number
  isStatusPollingEnabled: boolean
  adjudicationReasons: AdjudicationReason[]
  rejectionReason?: RejectedScanningReason
  currentPrecinctId: string
  isLoading: boolean
}

export interface State extends HardwareState, SharedState {}

const initialHardwareState: Readonly<HardwareState> = {
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  usbDriveStatus: UsbDriveStatus.absent,
  adminCardElectionHash: '',
  isAdminCardPresent: false,
  invalidCardPresent: false,
  lastCardDataString: '',
  // machineConfig: { machineId: '0000', codeVersion: 'dev' },
}

const initialSharedState: Readonly<SharedState> = {
  electionDefinition: undefined,
  isScannerConfigured: false,
  isTestMode: false,
  scannedBallotCount: 0,
  ballotState: BallotState.IDLE,
  isStatusPollingEnabled: true,
  adjudicationReasons: [],
  rejectionReason: undefined,
  currentPrecinctId: '',
  isLoading: false,
}

const initialAppState: Readonly<State> = {
  ...initialHardwareState,
  ...initialSharedState,
}

// Sets State.
type AppAction =
  | { type: 'unconfigureScanner' }
  | {
      type: 'updateElectionDefinition'
      electionDefinition: OptionalElectionDefinition
    }
  | { type: 'updateUsbDriveStatus'; usbDriveStatus: UsbDriveStatus }
  | {
      type: 'refreshConfigFromScanner'
      electionDefinition: OptionalElectionDefinition
      isTestMode: boolean
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
  | { type: 'updateLastCardDataString'; currentCardDataString: string }
  | { type: 'cardRemoved' }
  | { type: 'updatePrecinctId'; precinctId: string }
  | { type: 'startLoading' }
  | { type: 'endLoading' }

const appReducer = (state: State, action: AppAction): State => {
  // useful for debugging
  // console.log(
  //   '%cReducer "%s"',
  //   'color: green',
  //   action.type,
  //   { ...action, electionDefinition: undefined },
  //   {
  //     ...state,
  //     electionDefinition: undefined,
  //   }
  // )
  switch (action.type) {
    case 'updateUsbDriveStatus':
      return {
        ...state,
        usbDriveStatus: action.usbDriveStatus,
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
        isTestMode: action.isTestMode,
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
        ballotState: BallotState.SCANNING,
        rejectionReason: undefined,
        adjudicationReasons: [],
        timeoutToInsertScreen: undefined,
        scannedBallotCount:
          action.ballotCount === undefined
            ? state.scannedBallotCount
            : action.ballotCount,
      }
    case 'ballotCast':
      return {
        ...state,
        ballotState: BallotState.CAST,
        rejectionReason: undefined,
        adjudicationReasons: [],
        timeoutToInsertScreen: action.timeoutToInsertScreen,
      }
    case 'scannerError':
      return {
        ...state,
        ballotState: BallotState.SCANNER_ERROR,
        timeoutToInsertScreen: action.timeoutToInsertScreen,
        rejectionReason: undefined,
        adjudicationReasons: [],
        scannedBallotCount:
          action.ballotCount === undefined
            ? state.scannedBallotCount
            : action.ballotCount,
      }
    case 'ballotRejected':
      return {
        ...state,
        rejectionReason: action.rejectionReason,
        adjudicationReasons: [],
        ballotState: BallotState.REJECTED,
      }
    case 'ballotNeedsReview':
      return {
        ...state,
        rejectionReason: undefined,
        adjudicationReasons: action.adjudicationReasons,
        ballotState: BallotState.NEEDS_REVIEW,
      }
    case 'readyToInsertBallot':
      return {
        ...state,
        ballotState: BallotState.IDLE,
        rejectionReason: undefined,
        adjudicationReasons: [],
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
      }
    case 'updatePrecinctId':
      return {
        ...state,
        currentPrecinctId: action.precinctId,
      }
    case 'startLoading':
      return {
        ...state,
        isStatusPollingEnabled: false,
        isLoading: true,
      }
    case 'endLoading':
      return {
        ...state,
        isStatusPollingEnabled: true,
        isLoading: false,
      }
  }
}

const sleep = (ms = 1000): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

const AppRoot: React.FC<Props> = ({ hardware, card }) => {
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
    isLoading,
  } = appState

  const refreshConfig = useCallback(async () => {
    const electionDefinition = await config.getElectionDefinition()
    const isTestMode = await config.getTestMode()
    dispatchAppState({
      type: 'refreshConfigFromScanner',
      electionDefinition,
      isTestMode,
    })
  }, [dispatchAppState])

  const dismissCurrentBallotMessage = useCallback((): number => {
    return window.setTimeout(
      () => dispatchAppState({ type: 'readyToInsertBallot' }),
      TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS
    )
  }, [dispatchAppState])

  const scanDetectedBallot = useCallback(async () => {
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
      if (status === UsbDriveStatus.present) {
        await doMount()
      }
    },
    /* istanbul ignore next */
    usbDriveStatus === UsbDriveStatus.notavailable
      ? null
      : POLLING_INTERVAL_FOR_USB,
    true
  )

  const [startBallotStatusPolling, endBallotStatusPolling] = useInterval(
    async () => {
      if (!isStatusPollingEnabled) {
        return
      }

      const { scannerState, ballotCount } = await scan.getCurrentStatus()

      const isCapableOfBeginingNewScan =
        ballotState === BallotState.IDLE ||
        ballotState === BallotState.CAST ||
        ballotState === BallotState.SCANNER_ERROR

      const isHoldingPaperForVoterRemoval =
        ballotState === BallotState.REJECTED ||
        ballotState === BallotState.NEEDS_REVIEW

      // console.log('%cStatus update', 'color: cyan', {
      //   scannerState,
      //   ballotCount,
      //   ballotState,
      //   isCapableOfBeginingNewScan,
      //   isHoldingPaperForVoterRemoval,
      // })

      // Figure out what ballot state we are in, defaulting to the current state.
      switch (scannerState) {
        case ScannerStatus.Error:
        case ScannerStatus.Unknown: {
          // The scanner returned an error move to the error screen. Assume there is not currently paper in the scanner.
          // TODO(caro) Bugs in module-scan make this happen at confusing moments, ignore for now.
          /* dispatchAppState({
            type: 'scannerError',
            timeoutToInsertScreen: dismissCurrentBallotMessage(),
            ballotCount,
          }) */
          return
        }
        case ScannerStatus.ReadyToScan:
          if (isCapableOfBeginingNewScan) {
            // If we are going to reset the machine back to the insert ballot screen, cancel that.
            dispatchAppState({ type: 'disableStatusPolling' })
            await sleep(100)
            const {
              scannerState: scannerStateFirstCheck,
            } = await scan.getCurrentStatus()
            if (scannerStateFirstCheck !== scannerState) {
              dispatchAppState({ type: 'enableStatusPolling' })
              return
            }
            await sleep(100)
            const {
              scannerState: scannerStateSecondCheck,
            } = await scan.getCurrentStatus()
            if (scannerStateSecondCheck !== scannerState) {
              dispatchAppState({ type: 'enableStatusPolling' })
              return
            }
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
            // double check that we're still waiting for paper and it wasn't a very brief blip
            dispatchAppState({ type: 'disableStatusPolling' })
            await sleep(100)
            const {
              scannerState: scannerStateFirstCheck,
            } = await scan.getCurrentStatus()
            if (scannerStateFirstCheck !== scannerState) {
              dispatchAppState({ type: 'enableStatusPolling' })
              return
            }
            await sleep(100)
            const {
              scannerState: scannerStateSecondCheck,
            } = await scan.getCurrentStatus()
            if (scannerStateSecondCheck !== scannerState) {
              dispatchAppState({ type: 'enableStatusPolling' })
              return
            }
            // The voter has removed the ballot, end the batch and reset to the insert screen.
            await endBatch()
            /* istanbul ignore next */
            if (timeoutToInsertScreen) {
              window.clearTimeout(timeoutToInsertScreen)
            }
            dispatchAppState({ type: 'readyToInsertBallot', ballotCount })
            return
          }
          if (ballotState === BallotState.SCANNING) {
            // Is this dangerous? When a ballot is cast succesfully could this polling return waiting for paper before the ballotState is cast?
            // TODO(caro) not sure what, if anything we should do here it can randomly happen from time to time when there is no issue.
            /* dispatchAppState({
              type: 'scannerError',
              timeoutToInsertScreen: dismissCurrentBallotMessage(),
              ballotCount,
            }) */
            return
          }
      }
      if (ballotCount !== scannedBallotCount) {
        dispatchAppState({ type: 'updateBallotCount', ballotCount })
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
        console.error('failed to initialize:', e) // eslint-disable-line no-console
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
    // TODO(caro): also check for polls open and no card insertted
    if (isScannerConfigured && electionDefinition) {
      startBallotStatusPolling()
    } else {
      endBallotStatusPolling()
    }
  }, [isScannerConfigured, electionDefinition])

  const setElectionDefinition = async (
    electionDefinition: OptionalElectionDefinition
  ) => {
    dispatchAppState({ type: 'updateElectionDefinition', electionDefinition })
    await refreshConfig()
  }

  const toggleTestMode = async () => {
    dispatchAppState({ type: 'startLoading' })
    await config.setTestMode(!isTestMode)
    await refreshConfig()
    dispatchAppState({ type: 'endLoading' })
  }

  const unconfigureServer = useCallback(async () => {
    dispatchAppState({ type: 'startLoading' })
    try {
      await config.setElection(undefined)
      endBallotStatusPolling()
      await refreshConfig()
    } catch (error) {
      console.error('failed unconfigureServer()', error) // eslint-disable-line no-console
    } finally {
      dispatchAppState({ type: 'endLoading' })
    }
  }, [refreshConfig])

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
          // TODO(caro) Properly process pollworker cards
          dispatchAppState({
            type: 'invalidCard',
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
    } else {
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

  // Initilize app state
  useEffect(() => {
    startUsbStatusPolling()
    startCardShortValueReadPolling()
    return () => {
      stopCardShortValueReadPolling()
      stopUsbStatusPolling()
    }
  }, [startUsbStatusPolling, startCardShortValueReadPolling])

  const updatePrecinctId = (precinctId: string) => {
    dispatchAppState({ type: 'updatePrecinctId', precinctId })
  }

  if (!hasCardReaderAttached) {
    return <SetupCardReaderPage />
  }

  if (!isScannerConfigured) {
    return <LoadingConfigurationScreen />
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!electionDefinition) {
    return (
      <UnconfiguredElectionScreen
        usbDriveStatus={usbDriveStatus}
        setElectionDefinition={setElectionDefinition}
      />
    )
  }

  const dismissError = () => {
    /* istanbul ignore next */
    if (timeoutToInsertScreen) {
      window.clearTimeout(timeoutToInsertScreen)
    }
    dispatchAppState({ type: 'readyToInsertBallot' })
  }

  // TODO(caro): After implementing admin and pollworker screens, we should check whether polls are opened
  // or closed and possibly return the PollsClosedScreen here.
  if (invalidCardPresent) {
    return <InvalidCardScreen />
  }

  if (isAdminCardPresent) {
    // TODO(caro) update with real ballots scanned count
    return (
      <AdminScreen
        appPrecinctId={currentPrecinctId}
        updateAppPrecinctId={updatePrecinctId}
        ballotsScannedCount={0}
        electionDefinition={electionDefinition}
        isLiveMode={!isTestMode}
        toggleLiveMode={toggleTestMode}
        unconfigure={unconfigureServer}
      />
    )
  }

  // The polls are open for voters to utilize.
  switch (ballotState) {
    case BallotState.IDLE:
      return (
        <InsertBallotScreen
          electionDefinition={electionDefinition}
          scannedBallotCount={scannedBallotCount}
        />
      )
    case BallotState.SCANNING:
      return <ScanProcessingScreen />
    case BallotState.NEEDS_REVIEW:
      return (
        <ScanWarningScreen
          acceptBallot={acceptBallot}
          adjudicationReasons={adjudicationReasons}
        />
      )
    case BallotState.CAST:
      return (
        <ScanSuccessScreen
          electionDefinition={electionDefinition}
          scannedBallotCount={scannedBallotCount}
        />
      )
    case BallotState.SCANNER_ERROR:
      // TODO(caro) update to generic error screen
      return <ScanErrorScreen dismissError={dismissError} />
    case BallotState.REJECTED:
      return <ScanErrorScreen rejectionReason={rejectionReason} />
    /* istanbul ignore next */
    default:
      throwIllegalValue(ballotState)
  }
}

export default AppRoot
