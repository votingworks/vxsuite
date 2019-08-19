import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import 'normalize.css'
import './App.css'

import Screen from './components/Screen'

import AppRoot from './AppRoot'

const App = () => (
  <BrowserRouter>
    <Screen>
      <Route path="/" component={AppRoot} />
    </Screen>
  </BrowserRouter>
)

export default App
