import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { LocalStorage, KioskStorage } from './utils/Storage'

import AppRoot, { Props as AppRootProps } from './AppRoot'

export interface Props {
  storage?: AppRootProps['storage']
}

/* istanbul ignore next - need to figure out how to test this */
const defaultStorage = window.kiosk ? new KioskStorage() : new LocalStorage()

const App: React.FC<Props> = ({ storage = defaultStorage }) => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => <AppRoot storage={storage} {...props} />}
    />
  </BrowserRouter>
)

export default App
