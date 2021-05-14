import React from 'react'

import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { TimesCircle } from '../components/Graphics'

const SetupCardReaderPage: React.FC = () => (
  <CenteredScreen infoBar={false}>
    <TimesCircle />
    <CenteredLargeProse>
      <h1>Invalid Card, please remove.</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default SetupCardReaderPage
