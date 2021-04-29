/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen } from '@votingworks/ui'

const AdminScreen: React.FC = () => (
  <Screen>
    <Main padded>
      <MainChild>
        <Prose>
          <h1>Precinct Scanner Admin Screen</h1>
          <p>Select Precinct menu</p>
          <p>Testing Mode toggle</p>
          <p>Set Current Date and Time</p>
          <p>Remove Configuration button</p>
        </Prose>
      </MainChild>
    </Main>
  </Screen>
)

export default AdminScreen
