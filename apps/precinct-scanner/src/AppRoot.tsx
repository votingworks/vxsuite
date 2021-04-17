import React from 'react'
import { RouteComponentProps } from 'react-router-dom'
import 'normalize.css'
import { Storage } from './utils/Storage'

export interface Props extends RouteComponentProps {
  storage: Storage
}

const AppRoot: React.FC<Props> = () => {
  return <div>Hello Precinct Scanner World!</div>
}

export default AppRoot
