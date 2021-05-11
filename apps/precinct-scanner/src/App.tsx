import React from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { WebServiceCard, getHardware } from '@votingworks/utils'
import AppRoot, { Props as AppRootProps } from './AppRoot'
import { LocalStorage } from './utils/Storage'
import machineConfigProvider from './utils/machineConfig'

export interface Props {
  hardware?: AppRootProps['hardware']
  card?: AppRootProps['card']
  machineConfig?: AppRootProps['machineConfig']
  storage?: AppRootProps['storage']
}

const App: React.FC<Props> = ({
  hardware = getHardware(),
  card = new WebServiceCard(),
  storage = new LocalStorage(),
  machineConfig = machineConfigProvider,
}) => (
  <BrowserRouter>
    <Route
      path="/"
      render={(props) => (
        <AppRoot
          card={card}
          hardware={hardware}
          machineConfig={machineConfig}
          storage={storage}
          {...props}
        />
      )}
    />
  </BrowserRouter>
)

export default App
