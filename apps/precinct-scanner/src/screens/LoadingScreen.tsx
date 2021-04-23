import React from 'react'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const LoadingScreen: React.FC = () => (
  <CenteredScreen infoBar={false}>
    <CenteredLargeProse>
      <h1>Loading…</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default LoadingScreen
