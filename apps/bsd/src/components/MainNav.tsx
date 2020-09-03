import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const Brand = styled.div`
  display: inline-block;
  margin: 2px 0.5rem;
  white-space: nowrap;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`
const MakeName = styled.div`
  font-size: 0.75rem;
  font-weight: 700;
`

const ModelName = styled.div``
interface Props {
  children?: React.ReactNode
  isTestMode?: boolean
}

const MainNav = ({ children, isTestMode = false }: Props) => (
  <ButtonBar
    secondary
    naturalOrder
    separatePrimaryButton
    centerOnlyChild={false}
  >
    <Brand>
      <MakeName>
        Voting<span>Works</span>
      </MakeName>
      <ModelName>
        Ballot Scanner{isTestMode && <span>&nbsp;TEST&nbsp;MODE</span>}
      </ModelName>
    </Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
