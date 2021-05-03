import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const LoadingConfigurationScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Loading Configuration…</h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default LoadingConfigurationScreen
