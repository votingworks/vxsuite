import { ScannerStatus } from '@votingworks/types/api/module-scan'
import React, { useCallback, useEffect, useReducer } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import useInterval from '@rooks/use-interval'
import 'normalize.css'

import {
  ElectionDefinition,
  OptionalElectionDefinition,
} from '@votingworks/types'
import UnconfiguredElectionScreen from './screens/UnconfiguredElectionScreen'
import LoadingConfigurationScreen from './screens/LoadingConfigurationScreen'
import { Storage } from './utils/Storage'

// import AdminScreen from './screens/AdminScreen'
// <AdminScreen
//   appPrecinctId="42"
//   ballotsScannedCount={42}
//   electionDefinition={electionDefinition}
//   isLiveMode={false}
//   updateAppPrecinctId={(appPrecinctId: string) => { ... }}
//   toggleLiveMode={() => {}}
//   unconfigure={() => {}}
// />
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
import BallotScanningScreen from './screens/BallotScanningScreen'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  UsbDriveStatus,
} from './utils/usbstick'
import { BallotState, ScanningResult, ISO8601Timestamp } from './config/types'
import * as config from './api/config'
import * as scan from './api/scan'
import throwIllegalValue from './utils/throwIllegalValue'
import {
  POLLING_INTERVAL_FOR_SCANNER_STATUS_MS,
  POLLING_INTERVAL_FOR_USB,
  TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS,
} from './config/globals'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  configuredAt?: ISO8601Timestamp
}

export interface Props extends RouteComponentProps {
  storage: Storage
}

interface HardwareState {
  hasCardReaderAttached: boolean
  hasPrinterAttached: boolean
  usbDriveStatus: UsbDriveStatus
}

interface SharedState {
  electionDefinition: OptionalElectionDefinition
  isScannerConfigured: boolean
  isTestMode: boolean
  scannedBallotCount: number
  ballotState: BallotState
  timeoutToInsertScreen?: number
}

export interface State extends HardwareState, SharedState {}

const initialHardwareState: Readonly<HardwareState> = {
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  usbDriveStatus: UsbDriveStatus.absent,
}

const initialSharedState: Readonly<SharedState> = {
  electionDefinition: undefined,
  isScannerConfigured: false,
  isTestMode: false,
  scannedBallotCount: 0,
  ballotState: BallotState.IDLE,
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
    }
  | {
      type: 'ballotRejected'
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

const appReducer = (state: State, action: AppAction): State => {
  // useful for debugging
  /* console.log(
    '%cReducer "%s"',
    'color: green',
    action.type,
    { ...action, electionDefinition: undefined },
    {
      ...state,
      electionDefinition: undefined,
    }
  ) */
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
        timeoutToInsertScreen: action.timeoutToInsertScreen,
      }
    case 'scannerError':
      return {
        ...state,
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
        ballotState: BallotState.REJECTED,
      }
    case 'ballotNeedsReview':
      return {
        ...state,
        ballotState: BallotState.NEEDS_REVIEW,
      }
    case 'readyToInsertBallot':
      return {
        ...state,
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
        ballotState: BallotState.IDLE,
        scannedBallotCount: action.ballotCount,
      }
  }
}

const AppRoot: React.FC<Props> = () => {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    usbDriveStatus,
    electionDefinition,
    isScannerConfigured,
    ballotState,
    scannedBallotCount,
    timeoutToInsertScreen,
  } = appState

  const refreshConfig = useCallback(async () => {
    const electionDefinition = await config.getElectionDefinition()
    const isTestMode = await config.getTestMode()
    dispatchAppState({
      type: 'refreshConfigFromScanner',
      electionDefinition,
      isTestMode,
    })
  }, [])

  const dismissCurrentBallotMessage = (): number => {
    return window.setTimeout(
      () => dispatchAppState({ type: 'readyToInsertBallot' }),
      TIME_TO_DISMISS_ERROR_SUCCESS_SCREENS_MS
    )
  }

  const scanDetectedBallot = async () => {
    try {
      const scanningResult = await scan.scanDetectedSheet()
      switch (scanningResult) {
        case ScanningResult.Rejected: {
          dispatchAppState({
            type: 'ballotRejected',
          })
          break
        }
        case ScanningResult.NeedsReview:
          dispatchAppState({ type: 'ballotNeedsReview' })
          break
        case ScanningResult.Accepted: {
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
    }
  }

  const acceptBallot = async () => {
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
  }

  useInterval(
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
      const { scannerState, ballotCount } = await scan.getCurrentStatus()

      const isCapableOfBeginingNewScan =
        ballotState === BallotState.IDLE ||
        ballotState === BallotState.CAST ||
        ballotState === BallotState.SCANNER_ERROR

      const isHoldingPaperForVoterRemoval =
        ballotState === BallotState.REJECTED ||
        ballotState === BallotState.NEEDS_REVIEW

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
            // The voter has removed the ballot, reset to the insert screen.
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

  /* TODO(caro) this will be used for the admin screen
  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined)
      endBallotStatusPolling()
      await refreshConfig()
    } catch (error) {
      console.error('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [refreshConfig]) */

  if (!isScannerConfigured) {
    return <LoadingConfigurationScreen />
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
      return <BallotScanningScreen />
    case BallotState.NEEDS_REVIEW:
      return <ScanWarningScreen acceptBallot={acceptBallot} />
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
      return <ScanErrorScreen />
    /* istanbul ignore next */
    default:
      throwIllegalValue(ballotState)
  }
}

export default AppRoot
