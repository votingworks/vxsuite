import {
  getHardware,
  KioskStorage,
  LocalStorage,
  WebServiceCard,
} from '@votingworks/utils'
import React, { useEffect, useState } from 'react'
import './App.css'
import AppRoot, { Props as AppRootProps } from './AppRoot'

export type Props = Partial<AppRootProps>

const App = ({
  hardware,
  card = new WebServiceCard(),
  storage = window.kiosk ? new KioskStorage() : new LocalStorage(),
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

  return <AppRoot card={card} hardware={internalHardware} storage={storage} />
}

export default App
