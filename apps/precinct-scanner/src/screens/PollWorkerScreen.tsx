/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const PollWorkerScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild>
        <Prose>
          <h1>Precinct Scanner Poll Worker Screen</h1>
          <p>
            Error Message - Attach Printer (because only necessary for poll
            worker)
          </p>
          <p>Open/Close Polls</p>
          <p>Machine ID</p>
          <p>Election ID</p>
          <p>Software Version</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default PollWorkerScreen
