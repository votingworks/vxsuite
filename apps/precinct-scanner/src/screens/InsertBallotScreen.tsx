import React from 'react'
import { format } from '@votingworks/utils'
import { Absolute } from '../components/Absolute'
import { InsertBallot } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Bar } from '../components/Bar'

interface Props {
  scannedBallotCount: number
}

const InsertBallotScreen: React.FC<Props> = ({ scannedBallotCount }) => {
  return (
    <CenteredScreen>
      <InsertBallot />
      <CenteredLargeProse>
        <h1>Insert Your Ballot Below</h1>
        <p>Scan one ballot sheet at a time.</p>
      </CenteredLargeProse>
      <Absolute top left>
        <Bar>
          <div>
            Ballots Scanned:{' '}
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
