/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'
import { TopLeftContent } from '../components/AbsoluteElements'
import ElectionInfoBar from '../components/ElectionInfoBar'

const InsertBallotScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Insert Ballot</h1>
          <p>Insert each sheet individually.</p>
        </Prose>
        <TopLeftContent>
          <Prose>
            <p>
              Ballots Scanned: <strong>0</strong>
            </p>
          </Prose>
        </TopLeftContent>
        <ElectionInfoBar />
      </MainChild>
    </Main>
  </Screen>
)

export default InsertBallotScreen
