import React from 'react'

import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { TimesCircle } from '../components/Graphics'

const InvalidCardScreen: React.FC = () => (
  <CenteredScreen infoBar={false}>
    <TimesCircle />
    <CenteredLargeProse>
      <h1>Invalid Card, please remove.</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default InvalidCardScreen

/* istanbul ignore next */
export const DefaultPreview: React.FC = () => {
  return <InvalidCardScreen />
}
