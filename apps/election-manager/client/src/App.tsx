import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { LocalStorage } from './utils/Storage'

import AppRoot, { Props as AppRootProps, AppStorage } from './AppRoot'

export interface Props {
  storage?: AppRootProps['storage']
}

const App = ({ storage = new LocalStorage<AppStorage>() }) => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => <AppRoot storage={storage} {...props} />}
    />
  </BrowserRouter>
)

export default App
