/* istanbul ignore file */
import React from 'react'
import {
  Prose,
  Main,
  MainChild,
  Screen,
  Button,
  fontSizeTheme,
} from '@votingworks/ui'
import { Absolute } from '../components/Absolute'
import { PlaceholderGraphic } from '../components/Graphics'

const ScanErrorScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }
  return (
    <Screen>
      <Main padded>
        <MainChild center maxWidth={false}>
          <PlaceholderGraphic />
          <Prose textCenter maxWidth={false} theme={{ ...fontSizeTheme.large }}>
            <h1>Scanning Error</h1>
            <p>Please request Poll Worker assistance.</p>
          </Prose>
          <Absolute top right padded>
            <Button onPress={onPressPlaceholder}>Dismiss Error</Button>
          </Absolute>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ScanErrorScreen
