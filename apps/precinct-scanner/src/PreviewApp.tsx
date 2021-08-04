/* istanbul ignore file */

import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
  primaryElectionSampleDefinition,
} from '@votingworks/fixtures'
import React from 'react'
import PreviewDashboard from './PreviewDashboard'
import * as AdminScreen from './screens/AdminScreen'
import * as InsertBallotScreen from './screens/InsertBallotScreen'
import * as InvalidCardScreen from './screens/InvalidCardScreen'
import * as LoadingConfigurationScreen from './screens/LoadingConfigurationScreen'
import * as PollsClosedScreen from './screens/PollsClosedScreen'
import * as PollWorkerScreen from './screens/PollWorkerScreen'
import * as ScanErrorScreen from './screens/ScanErrorScreen'
import * as ScanProcessingScreen from './screens/ScanProcessingScreen'
import * as ScanSuccessScreen from './screens/ScanSuccessScreen'
import * as ScanWarningScreen from './screens/ScanWarningScreen'
import * as SetupCardReaderPage from './screens/SetupCardReaderPage'
import * as UnconfiguredElectionScreen from './screens/UnconfiguredElectionScreen'

const PreviewApp: React.FC = () => {
  return (
    <PreviewDashboard
      electionDefinitions={[
        electionSampleDefinition,
        primaryElectionSampleDefinition,
        electionWithMsEitherNeitherDefinition,
      ]}
      modules={[
        AdminScreen,
        InsertBallotScreen,
        InvalidCardScreen,
        LoadingConfigurationScreen,
        PollsClosedScreen,
        PollWorkerScreen,
        ScanErrorScreen,
        ScanProcessingScreen,
        ScanSuccessScreen,
        ScanWarningScreen,
        SetupCardReaderPage,
        UnconfiguredElectionScreen,
      ]}
    />
  )
}

export default PreviewApp
