import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { LocalStorage, KioskStorage } from './utils/Storage'

import AppRoot, { Props as AppRootProps, AppStorage } from './AppRoot'

export interface Props {
  storage?: AppRootProps['storage']
}

const defaultStorage = window.kiosk
  ? new KioskStorage<AppStorage>()
  : new LocalStorage<AppStorage>()

const App = ({ storage = defaultStorage }) => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => <AppRoot storage={storage} {...props} />}
    />
  </BrowserRouter>
)

export default App
