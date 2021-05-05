/* istanbul ignore file */
import React from 'react'
import { Prose } from '@votingworks/ui'
import { OfficialScreen } from '../components/Layout'

const PollWorkerScreen: React.FC = () => (
  <OfficialScreen>
    <Prose>
      <h1>Precinct Scanner Poll Worker Screen</h1>
      <p>
        Error Message - Attach Printer (because only necessary for poll worker)
      </p>
      <p>Open/Close Polls</p>
      <p>Machine ID</p>
      <p>Election ID</p>
      <p>Software Version</p>
    </Prose>
  </OfficialScreen>
)

export default PollWorkerScreen
