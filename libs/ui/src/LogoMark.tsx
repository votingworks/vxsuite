import React from 'react'
import styled from 'styled-components'

const LogoMarkStyled = styled.img`
  float: right;
  margin: 0 0 1em 2em;
  height: 0.25in;
`
export const LogoMark = (): JSX.Element => (
  <LogoMarkStyled
    src="/votingworks-wordmark-black.svg"
    alt="VotingWorks logo"
  />
)
