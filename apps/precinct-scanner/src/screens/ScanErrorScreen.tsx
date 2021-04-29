/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const ScanErrorScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Scan Error</h1>
          <p>Error message here.</p>
          <p>
            “OK” Button to dismiss screen. Inserting another ballot into the
            scanner will also dismiss the error screen.
          </p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default ScanErrorScreen
