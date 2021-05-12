import React from 'react'
import { ElectionDefinition } from '@votingworks/types'
import { Absolute } from '../components/Absolute'
import { InsertBallot } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Bar } from '../components/Bar'
import * as format from '../utils/format'

interface Props {
  scannedBallotCount: number
  electionDefinition: ElectionDefinition
}

const InsertBallotScreen: React.FC<Props> = ({
  scannedBallotCount,
  electionDefinition,
}) => {
  return (
    <CenteredScreen electionDefinition={electionDefinition}>
      <InsertBallot />
      <CenteredLargeProse>
        <h1>Insert Your Ballot Below</h1>
        <p>Scan one ballot sheet at a time.</p>
      </CenteredLargeProse>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned:
            <strong data-testid="ballot-count">
              {format.count(scannedBallotCount)}
            </strong>
          </div>
        </Bar>
      </Absolute>
    </CenteredScreen>
  )
}
export default InsertBallotScreen
