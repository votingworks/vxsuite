import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { Storage } from './utils/Storage'

// import AdminScreen from './screens/AdminScreen'
// import InsertBallotScreen from './screens/InsertBallotScreen'
// import PollsClosedScreen from './screens/PollsClosedScreen'
// import PollWorkerScreen from './screens/PollWorkerScreen'
// import ScanErrorScreen from './screens/ScanErrorScreen'
// import ScanSuccessScreen from './screens/ScanSuccessScreen'
// import ScanWarningScreen from './screens/ScanWarningScreen'
import UnconfiguredScreen from './screens/UnconfiguredScreen'

export interface Props extends RouteComponentProps {
  storage: Storage
}

const AppRoot: React.FC<Props> = () => {
  return <UnconfiguredScreen />
}

export default AppRoot
