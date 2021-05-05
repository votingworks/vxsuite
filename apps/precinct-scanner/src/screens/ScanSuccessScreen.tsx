/* istanbul ignore file */
import React from 'react'

import { Prose, Main, MainChild, Screen, fontSizeTheme } from '@votingworks/ui'

import ElectionInfoBar from '../components/ElectionInfoBar'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'
import { Bar } from '../components/Bar'

const ScanSuccessScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild center>
        <PlaceholderGraphic />
        <Prose textCenter theme={fontSizeTheme.large}>
          <h1>Successful Scan!</h1>
          <p>Ready to scan next ballot sheet.</p>
        </Prose>
        <Absolute top left>
          <Bar>
            <Prose>
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

export default ScanSuccessScreen
