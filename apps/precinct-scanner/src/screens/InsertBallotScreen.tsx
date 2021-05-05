/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen, fontSizeTheme } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import ElectionInfoBar from '../components/ElectionInfoBar'
import { PlaceholderGraphic } from '../components/Graphics'
import { Bar } from '../components/Bar'

const InsertBallotScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild center>
        <PlaceholderGraphic />
        <Prose textCenter theme={fontSizeTheme.large}>
          <h1>Insert Ballot</h1>
          <p>Scan one ballot sheet at a time.</p>
        </Prose>
        <Absolute top left>
          <Bar>
            <Prose textCenter>
              <p>
                Ballots Scanned: <strong>0</strong>
              </p>
            </Prose>
          </Bar>
        </Absolute>
        <ElectionInfoBar />
      </MainChild>
    </Main>
  </Screen>
)

export default InsertBallotScreen
