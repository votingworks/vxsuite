import React from 'react'

import Brand from './Brand'
import ButtonBar from './ButtonBar'

interface Props {
  children?: React.ReactNode
  isTestMode?: boolean
}

const MainNav = ({ children, isTestMode = false }: Props) => (
  <ButtonBar secondary naturalOrder separatePrimaryButton>
    <Brand>
      VxScan
      {isTestMode && <React.Fragment>&nbsp;TEST&nbsp;MODE</React.Fragment>}
    </Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
