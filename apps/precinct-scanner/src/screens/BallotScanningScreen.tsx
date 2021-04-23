import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

// TODO(caro) replace with loading component once in ui lib
const BallotScanningScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Scanning</h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default BallotScanningScreen
