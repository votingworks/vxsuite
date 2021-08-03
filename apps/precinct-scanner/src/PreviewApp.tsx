/* istanbul ignore file */

import React from 'react'
import * as AdminScreen from './screens/AdminScreen'
import * as InsertBallotScreen from './screens/InsertBallotScreen'
import * as ScanWarningScreen from './screens/ScanWarningScreen'
import * as SetupCardReaderPage from './screens/SetupCardReaderPage'
import * as UnconfiguredElectionScreen from './screens/UnconfiguredElectionScreen'
import PreviewDashboard from './PreviewDashboard'

const PreviewApp: React.FC = () => {
  return (
    <PreviewDashboard
      modules={[
        AdminScreen,
        InsertBallotScreen,
        ScanWarningScreen,
        SetupCardReaderPage,
        UnconfiguredElectionScreen,
      ]}
    />
  )
}

export default PreviewApp
