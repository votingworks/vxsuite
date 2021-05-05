import React from 'react'
import { Prose, Main, MainChild, Screen, fontSizeTheme } from '@votingworks/ui'

const LoadingConfigurationScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild center maxWidth={false}>
        <Prose textCenter maxWidth={false} theme={{ ...fontSizeTheme.large }}>
          <h1>Loading Configuration…</h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default LoadingConfigurationScreen
