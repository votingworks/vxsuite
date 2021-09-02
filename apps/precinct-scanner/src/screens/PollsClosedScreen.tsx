import React from 'react'
import { DoNotEnter } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const PollsClosedScreen = (): JSX.Element => (
  <CenteredScreen>
    <DoNotEnter />
    <CenteredLargeProse>
      <h1>Polls Closed</h1>
      <p>Insert a Poll Worker Card to Open Polls.</p>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default PollsClosedScreen

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => <PollsClosedScreen />
