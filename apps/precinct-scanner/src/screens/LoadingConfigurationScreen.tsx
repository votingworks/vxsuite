import React from 'react'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { IndeterminateProgressBar } from '../components/Graphics'

const LoadingConfigurationScreen = (): JSX.Element => (
  <CenteredScreen infoBar={false}>
    <IndeterminateProgressBar />
    <CenteredLargeProse>
      <h1>Loading Configuration…</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default LoadingConfigurationScreen

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => <LoadingConfigurationScreen />
