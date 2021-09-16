import { fontSizeTheme, Main, MainChild, Prose } from '@votingworks/ui'
import React from 'react'
import styled from 'styled-components'
import Screen from '../components/Screen'
import StatusFooter from '../components/StatusFooter'

const LockedImage = styled.img`
  margin-right: auto;
  margin-bottom: 5px;
  margin-left: auto;
  height: 20vw;
`

export const MachineLockedScreen = (): JSX.Element => {
  return (
    <Screen>
      <Main>
        <MainChild center>
          <LockedImage src="locked.svg" alt="Locked Icon" />
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            <h1>Machine Locked</h1>
            <p>Insert an admin card to unlock.</p>
          </Prose>
        </MainChild>
      </Main>
      <StatusFooter />
    </Screen>
  )
}
