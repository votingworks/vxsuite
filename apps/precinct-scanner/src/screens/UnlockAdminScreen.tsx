import {
  fontSizeTheme,
  Prose,
  Text,
  NumberPad,
  Main,
  MainChild,
} from '@votingworks/ui'
import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import { SECURITY_PIN_LENGTH } from '../config/globals'
import { CenteredScreen } from '../components/Layout'

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;
  > div {
    width: 400px;
  }
`

const EnteredCode = styled.div`
  margin-top: 5px;
  text-align: center;
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`

interface Props {
  attemptToAuthenticateUser: (passcode: string) => boolean
}

const UnlockAdminScreen = ({
  attemptToAuthenticateUser,
}: Props): JSX.Element => {
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [showError, setShowError] = useState(false)
  const handleNumberEntry = (passcodeNumber: string) => {
    if (currentPasscode.length >= SECURITY_PIN_LENGTH) {
      // do nothing
      return
    }
    setCurrentPasscode((prev) => prev + passcodeNumber)
  }

  useEffect(() => {
    if (currentPasscode.length === SECURITY_PIN_LENGTH) {
      const success = attemptToAuthenticateUser(currentPasscode)
      if (!success) {
        setShowError(true)
        setCurrentPasscode('')
      }
    }
  }, [currentPasscode, attemptToAuthenticateUser])

  const currentPasscodeDisplayString = '*'
    .repeat(currentPasscode.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ')

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  )
  if (showError) {
    primarySentence = <Text warning>Invalid code. Please try again.</Text>
  }
  return (
    <CenteredScreen>
      <Main>
        <MainChild center>
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            {primarySentence}
            <EnteredCode>{currentPasscodeDisplayString}</EnteredCode>
            <NumberPadWrapper>
              <NumberPad onButtonPress={handleNumberEntry} />
            </NumberPadWrapper>
          </Prose>
        </MainChild>
      </Main>
    </CenteredScreen>
  )
}

export default UnlockAdminScreen

/* istanbul ignore next */
export const DefaultPreview = (): JSX.Element => {
  return (
    <UnlockAdminScreen
      attemptToAuthenticateUser={(passcode: string) => {
        return passcode === '000000'
      }}
    />
  )
}
