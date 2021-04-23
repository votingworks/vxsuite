import React from 'react'
import { Button } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

interface Props {
  dismissError?: () => void
}

const ScanErrorScreen: React.FC<Props> = ({ dismissError }) => {
  return (
    <CenteredScreen infoBar={false}>
      <PlaceholderGraphic />
      <CenteredLargeProse>
        <h1>Scanning Error</h1>
        <p>Please request Poll Worker assistance.</p>
      </CenteredLargeProse>
      {dismissError && (
        <Absolute top right padded>
          <Button onPress={dismissError}>Dismiss Error</Button>
        </Absolute>
      )}
    </CenteredScreen>
  )
}

export default ScanErrorScreen
