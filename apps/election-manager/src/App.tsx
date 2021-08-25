import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { LocalStorage, KioskStorage } from '@votingworks/utils'

import AppRoot, { Props as AppRootProps } from './AppRoot'
import getPrinter from './utils/printer'

export interface Props {
  storage?: AppRootProps['storage']
  printer?: AppRootProps['printer']
}

const defaultStorage = window.kiosk ? new KioskStorage() : new LocalStorage()

const App = ({
  storage = defaultStorage,
  printer = getPrinter(),
}: Props): JSX.Element => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => (
        <AppRoot storage={storage} printer={printer} {...props} />
      )}
    />
  </BrowserRouter>
)

export default App
