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
// import InsertBallotScreen from './screens/InsertBallotScreen'
// import PollsClosedScreen from './screens/PollsClosedScreen'
// import PollWorkerScreen from './screens/PollWorkerScreen'
// import ScanErrorScreen from './screens/ScanErrorScreen'
// import ScanSuccessScreen from './screens/ScanSuccessScreen'
// import ScanWarningScreen from './screens/ScanWarningScreen'

import {
  getStatus as usbDriveGetStatus,
  doMount,
  UsbDriveStatus,
} from './utils/usbstick'
import { ISO8601Timestamp } from './config/types'
import * as config from './api/config'

export interface AppStorage {
  electionDefinition?: ElectionDefinition
  configuredAt?: ISO8601Timestamp
}

export interface Props extends RouteComponentProps {
  storage: Storage
}

export const electionDefinitionStorageKey = 'electionDefinition'
export const configuredAtStorageKey = 'configuredAt'

interface HardwareState {
  hasCardReaderAttached: boolean
  hasPrinterAttached: boolean
  usbDriveStatus: UsbDriveStatus
  // machineConfig: Readonly<MachineConfig>
}

interface SharedState {
  electionDefinition: OptionalElectionDefinition
  isScannerConfigured: boolean
  isTestMode: boolean
}

export interface State extends HardwareState, SharedState {}

const initialHardwareState: Readonly<HardwareState> = {
  hasCardReaderAttached: true,
  hasPrinterAttached: true,
  usbDriveStatus: UsbDriveStatus.absent,
  // machineConfig: { machineId: '0000', codeVersion: 'dev' },
}

const initialSharedState: Readonly<SharedState> = {
  electionDefinition: undefined,
  isScannerConfigured: false,
  isTestMode: false,
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

const appReducer = (state: State, action: AppAction): State => {
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
  }
}

const AppRoot: React.FC<Props> = (/* { storage } */) => {
  const [appState, dispatchAppState] = useReducer(appReducer, initialAppState)
  const {
    usbDriveStatus,
    // machineConfig,
    electionDefinition,
    // isTestMode,
    isScannerConfigured,
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

  const usbStatusInterval = useInterval(
    async () => {
      const status = await usbDriveGetStatus()
      dispatchAppState({
        type: 'updateUsbDriveStatus',
        usbDriveStatus: status,
      })
      /* istanbul ignore next */
      if (status === UsbDriveStatus.present) {
        await doMount()
      }
    },
    /* istanbul ignore next */
    usbDriveStatus === UsbDriveStatus.notavailable ? null : 2000
  )
  const startUsbStatusPolling = useCallback(usbStatusInterval[0], [])

  useEffect(() => {
    const initialize = async () => {
      try {
        await refreshConfig()
      } catch (e) {
        console.error('failed to initialize:', e) // eslint-disable-line no-console
        dispatchAppState({
          type: 'unconfigureScanner',
        })
        window.setTimeout(initialize, 1000)
      }
    }

    initialize()
  }, [refreshConfig])

  useEffect(() => {
    startUsbStatusPolling()
  }, [startUsbStatusPolling])

  const setElectionDefinition = async (
    electionDefinition: OptionalElectionDefinition
  ) => {
    dispatchAppState({ type: 'updateElectionDefinition', electionDefinition })
    await refreshConfig()
  }

  const unconfigureServer = useCallback(async () => {
    try {
      await config.setElection(undefined)
      await refreshConfig()
    } catch (error) {
      console.error('failed unconfigureServer()', error) // eslint-disable-line no-console
    }
  }, [refreshConfig])

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

  return (
    <div>
      Congratulations the precinct scanner is configured!{' '}
      <button type="button" onClick={unconfigureServer}>
        {' '}
        Unconfigure{' '}
      </button>
    </div>
  )
}

export default AppRoot
