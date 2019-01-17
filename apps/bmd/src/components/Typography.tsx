import React from 'react'
import styled from 'styled-components'

interface TextProps {
  muted: boolean
}

export const Text = styled.span`
  color: ${(props: TextProps) => (props.muted ? 'gray' : 'black')};
`

export default Text
