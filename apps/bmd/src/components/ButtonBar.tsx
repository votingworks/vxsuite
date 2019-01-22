import React from 'react'
import styled from 'styled-components'

const Bar = styled.div`
  display: flex;
  padding: 1rem 2rem;
  background: grey;
  border-bottom: 1px solid darkgrey;
  justify-content: space-between;
  & > :first-child {
    order: 2;
  }
  @media print {
    display: none;
  }
`

interface Props {
  children: React.ReactNode
}

const ButtonBar = (props: Props) => <Bar>{props.children}</Bar>

export default ButtonBar
