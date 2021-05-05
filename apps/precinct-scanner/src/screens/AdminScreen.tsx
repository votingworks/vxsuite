/* istanbul ignore file */
import React from 'react'
import { Prose } from '@votingworks/ui'
import { OfficialScreen } from '../components/Layout'

const AdminScreen: React.FC = () => (
  <OfficialScreen>
    <Prose>
      <h1>Precinct Scanner Admin Screen</h1>
      <p>Select Precinct menu</p>
      <p>Testing Mode toggle</p>
      <p>Set Current Date and Time</p>
      <p>Remove Configuration button</p>
    </Prose>
  </OfficialScreen>
)

export default AdminScreen
