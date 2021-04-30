/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const ScanErrorScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Scan Warning (overvote, undervote, blank)</h1>
          <p>Warning description message here.</p>
          <p>
            Tabulate Button - “Tabulate with Overvote” “Tabulate Blank Ballot”
            or “Tabulate with Undervote”
          </p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default ScanErrorScreen
