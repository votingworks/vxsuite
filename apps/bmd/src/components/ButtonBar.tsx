import React from 'react'
import styled from 'styled-components'

const Bar = styled.div`
  display: flex;
  padding: 1rem 2rem;
  background: grey;
  border-bottom: 1px solid darkgrey;
  @media print {
    display: none;
  }
`
const BarContent = styled.div`
  display: flex;
  flex: 1;
`
const BarContentLeft = styled(BarContent)`
  justify-content: flex-start;
`
const BarContentCenter = styled(BarContent)`
  justify-content: center;
`
const BarContentRight = styled(BarContent)`
  justify-content: flex-start;
  flex-direction: row-reverse;
`

interface Props {
  leftContent?: React.ReactNode
  centerContent?: React.ReactNode
  rightContent?: React.ReactNode
}

const ButtonBar = (props: Props) => (
  <Bar>
    <BarContentLeft>{props.leftContent}</BarContentLeft>
    <BarContentCenter>{props.centerContent}</BarContentCenter>
    <BarContentRight>{props.rightContent}</BarContentRight>
  </Bar>
)

export default ButtonBar
