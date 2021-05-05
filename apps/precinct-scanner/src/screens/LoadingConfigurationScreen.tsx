import React from 'react'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const LoadingConfigurationScreen: React.FC = () => (
  <CenteredScreen infoBar={false}>
    <CenteredLargeProse>
      <h1>Loading Configuration…</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default LoadingConfigurationScreen
