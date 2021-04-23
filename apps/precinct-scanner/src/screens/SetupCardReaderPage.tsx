import React from 'react'
import { Prose, Main, MainChild, Screen, fontSizeTheme } from '@votingworks/ui'

const SetupCardReaderPage: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild center>
        <Prose textCenter theme={fontSizeTheme.large}>
          <h1>No Card Reader Detected</h1>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default SetupCardReaderPage
