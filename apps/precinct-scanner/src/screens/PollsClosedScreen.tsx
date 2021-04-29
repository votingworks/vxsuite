/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const PollsClosedScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Polls Closed</h1>
          <p>Insert a Poll Worker Card to Open Polls.</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default PollsClosedScreen
