/* istanbul ignore file */
import React from 'react'

import { ElectionDefinition } from '@votingworks/types'
import { DoNotEnter } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

interface Props {
  electionDefinition: ElectionDefinition
}

const PollsClosedScreen: React.FC<Props> = () => {
  return (
    <CenteredScreen>
      <DoNotEnter />
      <CenteredLargeProse>
        <h1>Polls Closed</h1>
        <p>Insert a Poll Worker Card to Open Polls.</p>
      </CenteredLargeProse>
    </CenteredScreen>
  )
}

export default PollsClosedScreen
