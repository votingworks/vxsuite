import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const Brand = styled.div`
  margin: 1rem 0.25rem;
  color: #ffffff;
  font-size: 1.3rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`

interface Props {
  children?: React.ReactNode
  title?: string
}

const MainNav = ({ children, title }: Props) => (
  <ButtonBar secondary naturalOrder>
    <Brand>VxEncode{title && <span> / {title}</span>}</Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
