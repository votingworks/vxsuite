import React from 'react'
import { IndeterminateProgressBar } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const ScanProcessingScreen: React.FC = () => (
  <CenteredScreen>
    <IndeterminateProgressBar />
    <CenteredLargeProse>
      <h1>Scanning Ballot…</h1>
    </CenteredLargeProse>
  </CenteredScreen>
)

export default ScanProcessingScreen
