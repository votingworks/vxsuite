import React from 'react'
import { Text } from '@votingworks/ui'
import { TimesCircle } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const ScannerCrashedScreen = (): JSX.Element => {
  return (
    <CenteredScreen infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Scanner Reboot Required</h1>
        <p>Ballot will be scanned and counted after reboot.</p>
        <Text italic>Ask a poll worker for assistance.</Text>
      </CenteredLargeProse>
    </CenteredScreen>
  )
}

export default ScannerCrashedScreen

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => {
  return <ScannerCrashedScreen />
}
