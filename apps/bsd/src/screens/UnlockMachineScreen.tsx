import { fontSizeTheme, Prose, Text, NumberPad } from '@votingworks/ui'
import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import Screen from '../components/Screen'
import Main, { MainChild } from '../components/Main'
import StatusFooter from '../components/StatusFooter'
import GLOBALS from '../config/globals'

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;
  > div {
    width: 400px;
  }
`

export const EnteredCode = styled.div`
  margin-top: 5px;
  text-align: center;
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`

export interface Props {
  attemptToAuthenticateUser: (passcode: string) => boolean
}

export const UnlockMachineScreen = ({
  attemptToAuthenticateUser,
}: Props): JSX.Element => {
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [showError, setShowError] = useState(false)
  const handleNumberEntry = (passcodeNumber: string) => {
    if (currentPasscode.length >= GLOBALS.SECURITY_PIN_LENGTH) {
      // do nothing
      return
    }
    setCurrentPasscode((prev) => prev + passcodeNumber)
  }

  useEffect(() => {
    if (currentPasscode.length === GLOBALS.SECURITY_PIN_LENGTH) {
      const success = attemptToAuthenticateUser(currentPasscode)
      if (!success) {
        setShowError(true)
        setCurrentPasscode('')
      }
    }
  }, [currentPasscode, attemptToAuthenticateUser])

  const currentPasscodeDisplayString = '*'
    .repeat(currentPasscode.length)
    .padEnd(GLOBALS.SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ')

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  )
  if (showError) {
    primarySentence = <Text warning>Invalid code. Please try again.</Text>
  }
  return (
    <Screen>
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
      <StatusFooter />
    </Screen>
  )
}
