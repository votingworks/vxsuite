import React from 'react'
import { Text } from '@votingworks/ui'
import { DoNotEnter } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

interface Props {
  showNoChargerWarning: boolean
}

const PollsClosedScreen = ({ showNoChargerWarning }: Props): JSX.Element => {
  return (
    <CenteredScreen>
      {showNoChargerWarning && (
        <Text warning small center>
          <strong>No Power Detected.</strong> Please ask a poll worker to plug
          in the power cord for this machine.
        </Text>
      )}
      <DoNotEnter />
      <CenteredLargeProse>
        <h1>Polls Closed</h1>
        <p>Insert a Poll Worker Card to Open Polls.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  )
}

export default PollsClosedScreen

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => {
  return <PollsClosedScreen showNoChargerWarning={false} />
}

/* istanbul ignore next */
export const NoPowerConnectedPreview = (): JSX.Element => {
  return <PollsClosedScreen showNoChargerWarning />
}
