/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen, Button } from '@votingworks/ui'
import styled from 'styled-components'
import ElectionInfoBar from '../components/ElectionInfoBar'
import { TopRightContent, TopLeftContent } from '../components/AbsoluteElements'

const EmojiHeading = styled.h1`
  &::before {
    display: block;
    text-align: center;
    line-height: 1.4;
    font-size: 4em;
    content: '🎉';
  }
`

const ScanSuccessScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }

  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <EmojiHeading>Successful Scan!</EmojiHeading>
            <p>Insert the next ballot sheet.</p>
          </Prose>
          <TopLeftContent>
            <Prose>
              <p>
                Ballots Scanned: <strong>0</strong>
              </p>
            </Prose>
          </TopLeftContent>

          <TopRightContent>
            <Button onPress={onPressPlaceholder}>Dismiss</Button>
          </TopRightContent>
          <ElectionInfoBar />
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ScanSuccessScreen
