/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen, Button } from '@votingworks/ui'
import { TopRightContent } from '../components/AbsoluteElements'

const ScanErrorScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>Scanning Error</h1>
            <p>Please request Poll Worker assistance.</p>
          </Prose>
          <TopRightContent>
            <Button onPress={onPressPlaceholder}>Dismiss</Button>
          </TopRightContent>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ScanErrorScreen
