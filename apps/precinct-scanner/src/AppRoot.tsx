import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { Storage } from './utils/Storage'
import UnconfiguredScreen from './screens/UnconfiguredScreen'

export interface Props extends RouteComponentProps {
  storage: Storage
}

const AppRoot: React.FC<Props> = () => {
  return <UnconfiguredScreen />
}

export default AppRoot
