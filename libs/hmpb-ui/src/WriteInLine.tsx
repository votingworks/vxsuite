import React from 'react'
import styled from 'styled-components'

interface Props {
  label?: string
}

const Container = styled.span`
  display: block;
  flex: 1;
  margin-top: 1em;
  border-bottom: 1pt solid #000000; /* stylelint-disable-line unit-blacklist */
`

export const WriteInLine = ({ label }: Props) => (
  <Container data-write-in-line>{label}</Container>
)
