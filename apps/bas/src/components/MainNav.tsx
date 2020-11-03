import React from 'react'
import styled from 'styled-components'

import ButtonBar from './ButtonBar'

const Brand = styled.div`
  margin: 0.45rem 0.25rem;
  white-space: nowrap;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  & span {
    font-weight: 400;
  }
`

interface Props {
  children?: React.ReactNode
  title?: string
}

const MainNav: React.FC<Props> = ({ children, title }) => (
  <ButtonBar secondary naturalOrder separatePrimaryButton>
    <Brand>VxEncode{title && <span> / {title}</span>}</Brand>
    {children || <div />}
  </ButtonBar>
)

export default MainNav
