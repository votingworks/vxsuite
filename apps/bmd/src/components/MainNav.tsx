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
  app?: string
  children?: React.ReactNode
  title?: string
}

const MainNav = ({ app = 'VxMark', children, title }: Props) => (
  <ButtonBar secondary naturalOrder>
    <Brand>
      {app}
      {title && <span> / {title}</span>}
    </Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
