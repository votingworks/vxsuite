/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const InsertBallotScreen: React.FC = () => (
  <Screen>
    <Main>
      <MainChild center>
        <Prose textCenter>
          <h1>Insert Ballot</h1>
          <p>Insert one single sheet at a time.</p>
          <small>
            <p>
              Election Info: title, date, county, state, precinct name, election
              ID
            </p>
            <p>Ballots Scanned: 0</p>
          </small>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default InsertBallotScreen
