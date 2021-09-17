import React from 'react'
import { format } from '@votingworks/utils'
import { TestMode, Text } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { InsertBallot } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { Bar } from '../components/Bar'

interface Props {
  isLiveMode: boolean
  scannedBallotCount: number
  showNoChargerWarning: boolean
}

const InsertBallotScreen = ({
  isLiveMode,
  scannedBallotCount,
  showNoChargerWarning,
}: Props): JSX.Element => {
  return (
    <CenteredScreen>
      <TestMode isLiveMode={isLiveMode} />
      {showNoChargerWarning && (
        <Text warning small center>
          <strong>No Power Detected.</strong> Please ask a poll worker to plug
          in the power cord for this machine.
        </Text>
      )}
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

/* istanbul ignore next */
export const ZeroBallotsScannedTestPreview = (): JSX.Element => {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={0}
      showNoChargerWarning={false}
    />
  )
}

/* istanbul ignore next */
export const ManyBallotsScannedLivePreview = (): JSX.Element => {
  return (
    <InsertBallotScreen
      scannedBallotCount={1234}
      isLiveMode
      showNoChargerWarning={false}
    />
  )
}

/* istanbul ignore next */
export const NoPowerConnectedTestPreview = (): JSX.Element => {
  return (
    <InsertBallotScreen
      isLiveMode={false}
      scannedBallotCount={1234}
      showNoChargerWarning
    />
  )
}
