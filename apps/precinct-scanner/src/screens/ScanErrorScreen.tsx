/* istanbul ignore file */
import React from 'react'
import { Button } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const ScanErrorScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }
  return (
    <CenteredScreen infoBar={false}>
      <PlaceholderGraphic />
      <CenteredLargeProse>
        <h1>Scanning Error</h1>
        <p>Please request Poll Worker assistance.</p>
      </CenteredLargeProse>
      <Absolute top right padded>
        <Button onPress={onPressPlaceholder}>Dismiss Error</Button>
      </Absolute>
    </CenteredScreen>
  )
}

export default ScanErrorScreen
