/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen, fontSizeTheme } from '@votingworks/ui'

import ElectionInfoBar from '../components/ElectionInfoBar'
import { PlaceholderGraphic } from '../components/Graphics'

const PollsClosedScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild center maxWidth={false}>
        <PlaceholderGraphic />
        <Prose textCenter maxWidth={false} theme={{ ...fontSizeTheme.large }}>
          <h1>Polls Closed</h1>
          <p>Insert a Poll Worker Card to Open Polls.</p>
        </Prose>
        <ElectionInfoBar />
      </MainChild>
    </Main>
  </Screen>
)

export default PollsClosedScreen
