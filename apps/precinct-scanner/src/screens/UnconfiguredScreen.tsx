import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const UnconfiguredScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Precinct Scanner is Not Configured</h1>
          <p>Insert USB Drive with configuration.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default UnconfiguredScreen
