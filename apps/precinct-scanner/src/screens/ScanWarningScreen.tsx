/* istanbul ignore file */
import React from 'react'
import { Button, Text } from '@votingworks/ui'

import { PlaceholderGraphic } from '../components/Graphics'
import { CenteredLargeProse, CenteredScreen } from '../components/Layout'

const ScanWarningScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }

  return (
    <CenteredScreen infoBar={false}>
      <PlaceholderGraphic />
      <CenteredLargeProse>
        <h1>
          Overvote Warning
          {/* Undervote Warning */}
          {/* Overvote and Undervote Warning */}
          {/* Blank Ballot Warning */}
        </h1>
        <p>
          Contests:{' '}
          <Text as="span" noWrap>
            “Mayor”,
          </Text>{' '}
          <Text as="span" noWrap>
            “Dog Catcher”,
          </Text>{' '}
          <Text as="span" noWrap>
            “Board of Supervisors”
          </Text>
        </p>
        <p>
          <Button primary onPress={onPressPlaceholder}>
            Tabulate Ballot
          </Button>{' '}
          — or —{' '}
          <Button primary onPress={onPressPlaceholder}>
            Eject Ballot
          </Button>
        </p>
        <Text italic>Ask a poll worker if you need assistance.</Text>
      </CenteredLargeProse>
    </CenteredScreen>
  )
}

export default ScanWarningScreen
