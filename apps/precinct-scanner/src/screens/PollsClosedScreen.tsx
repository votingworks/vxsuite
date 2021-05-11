/* istanbul ignore file */
import React from 'react'

import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const PollsClosedScreen: React.FC = () => (
  <CenteredScreen>
    <PlaceholderGraphic />
    <CenteredLargeProse>
      <h1>Polls Closed</h1>
      <p>Insert a Poll Worker Card to Open Polls.</p>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default PollsClosedScreen
