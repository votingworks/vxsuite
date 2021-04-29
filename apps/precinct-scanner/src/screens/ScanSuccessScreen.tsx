/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const ScanSuccessScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Ballot Scanned!</h1>
          <p>Insert next ballot.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default ScanSuccessScreen
