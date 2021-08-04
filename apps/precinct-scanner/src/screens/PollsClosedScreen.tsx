import { strict as assert } from 'assert'
import React, { useContext } from 'react'

import { ElectionDefinition } from '@votingworks/types'
import { DoNotEnter } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import AppContext from '../contexts/AppContext'

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

/* istanbul ignore next */
export const DefaultPreview: React.FC = () => {
  const { electionDefinition } = useContext(AppContext)
  assert(electionDefinition)
  return <PollsClosedScreen electionDefinition={electionDefinition} />
}
