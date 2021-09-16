import React, { useEffect, useState } from 'react'
import { BrowserRouter, Route } from 'react-router-dom'

import './App.css'

import {
  LocalStorage,
  KioskStorage,
  getPrinter,
  getHardware,
  WebServiceCard,
} from '@votingworks/utils'

import AppRoot, { Props as AppRootProps } from './AppRoot'
import { machineConfigProvider } from './utils/machineConfig'

export interface Props {
  storage?: AppRootProps['storage']
  printer?: AppRootProps['printer']
  hardware?: AppRootProps['hardware']
  machineConfig?: AppRootProps['machineConfigProvider']
  card?: AppRootProps['card']
}

const defaultStorage = window.kiosk ? new KioskStorage() : new LocalStorage()

const App = ({
  hardware,
  card = new WebServiceCard(),
  storage = defaultStorage,
  printer = getPrinter(),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hardware])

  if (!internalHardware) {
    return <React.Fragment />
  }

  return (
    <BrowserRouter>
      <Route
        path="/"
        render={(props) => (
          <AppRoot
            storage={storage}
            printer={printer}
            hardware={internalHardware}
            card={card}
            machineConfigProvider={machineConfig}
            {...props}
          />
        )}
      />
    </BrowserRouter>
  )
}

export default App
