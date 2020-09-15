import React from 'react'
import styled from 'styled-components'

interface StyledProps {
  checked?: boolean
}

interface Props extends StyledProps {
  children?: React.ReactNode
}

export const Bubble = styled.span<StyledProps>`
  display: inline-block;
  border: 1pt solid #000000; /* stylelint-disable-line unit-blacklist */
  border-radius: 100%;
  background: ${({ checked }) => (checked ? '#000000' : undefined)};
  width: 1.5em;
  height: 1em;
  vertical-align: bottom;
`

const Container = styled.span`
  display: flex;
  align-items: flex-start;
  & > span:first-child {
    margin-top: 0.15em;
    margin-right: 0.3em;
  }
`

const Content = styled.span`
  display: flex;
  flex: 1;
  flex-direction: column;
`

export const BubbleMark = ({ checked = false, children }: Props) => (
  <Container>
    <Bubble checked={checked} data-mark />
    <Content>{children}</Content>
  </Container>
)
