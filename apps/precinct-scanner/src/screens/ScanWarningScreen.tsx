/* istanbul ignore file */
import React from 'react'
import { Prose, Main, MainChild, Screen, Button } from '@votingworks/ui'
import { BottomRightContent } from '../components/AbsoluteElements'

const ScanWarningScreen: React.FC = () => {
  const onPressPlaceholder = () => {
    // eslint-disable-next-line no-console
    console.log('dismiss screen')
  }

  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter>
            <h1>
              Overvote Warning
              {/* Undervote Warning */}
              {/* Blank Ballot Warning */}
              {/* Multiple Issues Detected */}
            </h1>
            <p>Details of the overvote/undervote/blank here.</p>
            <p>
              <strong>Remove the ballot and correct this error.</strong>
              <br />
              Ask a poll worker if you need assistance.
            </p>
            <BottomRightContent>
              <p>
                If you wish to cast the ballot as is, you may{' '}
                <Button onPress={onPressPlaceholder}>
                  Tabulate Ballot with Overvote
                </Button>
                {/* “Tabulate Blank Ballot” */}
                {/* “Tabulate with Undervote” */}
              </p>
            </BottomRightContent>
          </Prose>
        </MainChild>
      </Main>
    </Screen>
  )
}

export default ScanWarningScreen
