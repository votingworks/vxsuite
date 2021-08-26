import React, { useEffect, useState } from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import { WebServiceCard, LocalStorage, getHardware } from '@votingworks/utils'
import AppRoot, { Props as AppRootProps } from './AppRoot'

import machineConfigProvider from './utils/machineConfig'

export interface Props {
  hardware?: AppRootProps['hardware']
  card?: AppRootProps['card']
  machineConfig?: AppRootProps['machineConfig']
  storage?: AppRootProps['storage']
}

const App = ({
  hardware,
  card = new WebServiceCard(),
  storage = new LocalStorage(),
  machineConfig = machineConfigProvider,
}: Props): JSX.Element => {
  const [internalHardware, setInternalHardware] = useState(hardware)
  useEffect(() => {
    const updateHardware = async () => {
      if (internalHardware === undefined) {
        setInternalHardware(await getHardware())
      }
    }
    void updateHardware()
  }, [hardware])

  if (!internalHardware) {
    return <BrowserRouter />
  }
  return (
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            card={card}
            hardware={internalHardware}
            machineConfig={machineConfig}
            storage={storage}
            {...props}
          />
        )}
      />
    </BrowserRouter>
  )
}

export default App
