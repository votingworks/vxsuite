import { getHardware, WebServiceCard } from '@votingworks/utils'
import React, { useEffect, useState } from 'react'
import './App.css'
import AppRoot, { Props as AppRootProps } from './AppRoot'

export type Props = Partial<AppRootProps>

const App = ({ hardware, card = new WebServiceCard() }: Props): JSX.Element => {
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
    return <React.Fragment />
  }

  return <AppRoot card={card} hardware={internalHardware} />
}

export default App
