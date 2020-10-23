import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import AppRoot from './AppRoot'

const App: React.FC = () => (
  <BrowserRouter>
    <Route path="/">
      <AppRoot />
    </Route>
  </BrowserRouter>
)

export default App
