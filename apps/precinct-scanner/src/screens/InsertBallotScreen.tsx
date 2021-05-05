/* istanbul ignore file */
import React from 'react'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Bar } from '../components/Bar'

const InsertBallotScreen: React.FC = () => (
  <CenteredScreen>
    <PlaceholderGraphic />
    <CenteredLargeProse>
      <h1>Insert Ballot</h1>
      <p>Scan one ballot sheet at a time.</p>
    </CenteredLargeProse>
    <Absolute top left>
      <Bar>
        <div>
          Ballots Scanned: <strong>0</strong>
        </div>
      </Bar>
    </Absolute>
  </CenteredScreen>
)

export default InsertBallotScreen
