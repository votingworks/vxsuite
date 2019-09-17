import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const Brand = styled.div`
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`
interface Props {
  appName?: string
  children?: React.ReactNode
  title?: string
}

const MainNav = ({ appName = 'Unconfigured', children, title }: Props) => (
  <ButtonBar secondary naturalOrder>
    <Brand>
      {appName}
      {title && <span> / {title}</span>}
    </Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
