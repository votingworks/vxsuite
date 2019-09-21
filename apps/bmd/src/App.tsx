import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import 'normalize.css'
import './App.css'

import FocusManager from './components/FocusManager'

import AppRoot from './AppRoot'

/* istanbul ignore next - unsure how to test */
window.oncontextmenu = (e: MouseEvent): void => {
  e.preventDefault()
}

const App = () => (
  <BrowserRouter>
    <FocusManager>
      <Route path="/" component={AppRoot} />
    </FocusManager>
  </BrowserRouter>
)

export default App
