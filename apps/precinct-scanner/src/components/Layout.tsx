import React from 'react'
import { Screen, Main, MainChild, Prose, fontSizeTheme } from '@votingworks/ui'
import ElectionInfoBar from './ElectionInfoBar'

interface Props {
  children?: React.ReactNode
  infoBar?: boolean
}

export const CenteredScreen: React.FC<Props> = ({
  children,
  infoBar = true,
}) => (
  <Screen flexDirection="column">
    <Main padded>
      <MainChild center maxWidth={false}>
        {children}
      </MainChild>
    </Main>
    {infoBar && <ElectionInfoBar />}
  </Screen>
)

export const CenteredLargeProse: React.FC<Props> = ({ children }) => (
  <Prose textCenter maxWidth={false} theme={fontSizeTheme.large}>
    {children}
  </Prose>
)

export const OfficialScreen: React.FC<Props> = ({ children }) => (
  <Screen flexDirection="column">
    <Main padded>
      <MainChild>{children}</MainChild>
    </Main>
    <ElectionInfoBar mode="admin" />
  </Screen>
)
