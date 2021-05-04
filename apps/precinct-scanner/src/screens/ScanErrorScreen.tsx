import React from 'react'
import { Button, Text } from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { TimesCircle } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'
import { RejectedScanningReason } from '../config/types'

interface Props {
  dismissError?: () => void
  rejectionReason?: RejectedScanningReason
  isTestMode: boolean
}

const ScanErrorScreen: React.FC<Props> = ({
  dismissError,
  rejectionReason,
  isTestMode,
}) => {
  let errorInformation = ''
  if (rejectionReason && rejectionReason !== RejectedScanningReason.Unknown) {
    switch (rejectionReason) {
      case RejectedScanningReason.InvalidTestMode: {
        errorInformation = isTestMode
          ? 'Live Ballot detected.'
          : 'Test ballot detected.'
        break
      }
      case RejectedScanningReason.InvalidElectionHash: {
        errorInformation =
          'Scanned ballot does not match the election this scanner is configured for.'
        break
      }
      case RejectedScanningReason.Unreadable: {
        errorInformation =
          'There was a problem reading this ballot. Please try again.'
      }
    }
  }
  return (
    <CenteredScreen infoBar={false}>
      <TimesCircle />
      <CenteredLargeProse>
        <h1>Scanning Error</h1>
        <p>{errorInformation}</p>
        <Text italic>Ask a poll worker for assistance.</Text>
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
