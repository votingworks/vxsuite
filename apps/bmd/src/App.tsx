import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import 'normalize.css'
import './App.css'

import Screen from './components/Screen'

import AppRoot from './AppRoot'

/* istanbul ignore next - unsure how to test */
window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault()
}

const App = () => (
  <BrowserRouter>
    <Screen>
      <Route path="/" component={AppRoot} />
    </Screen>
  </BrowserRouter>
)

export default App
