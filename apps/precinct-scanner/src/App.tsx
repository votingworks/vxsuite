import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import AppRoot, { Props as AppRootProps } from './AppRoot'
import { getHardware } from './utils/Hardware'
import { WebServiceCard } from './utils/Card'

export interface Props {
  hardware?: AppRootProps['hardware']
  card?: AppRootProps['card']
}

/* istanbul ignore next - need to figure out how to test this */

const App: React.FC<Props> = ({
  hardware = getHardware(),
  card = new WebServiceCard(),
}) => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => <AppRoot card={card} hardware={hardware} {...props} />}
    />
  </BrowserRouter>
)

export default App
