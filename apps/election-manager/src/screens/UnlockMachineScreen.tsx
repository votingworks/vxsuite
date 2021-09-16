import {
  Button,
  fontSizeTheme,
  Main,
  MainChild,
  NumberPad,
  Prose,
  Text,
} from '@votingworks/ui'
import React, { useState, useContext, useEffect } from 'react'
import styled from 'styled-components'
import Screen from '../components/Screen'
import StatusFooter from '../components/StatusFooter'
import { SECURITY_PIN_LENGTH } from '../config/globals'
import AppContext from '../contexts/AppContext'

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

export const UnlockMachineScreen = (): JSX.Element => {
  const { attemptToAuthenticateUser, saveElection } = useContext(AppContext)
  const [currentPasscode, setCurrentPasscode] = useState('')
  const [showError, setShowError] = useState(false)
  // This is temporary while we improve the bootstrapping process. If PI is entered
  // and that does not unlock the machine, show a button to allow for resetting the machine.
  const [showFactoryReset, setShowFactoryReset] = useState(false)
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
        setShowFactoryReset(false)
        setShowError(true)
        // This is temporary while we improve the bootstrapping process. If PI is entered
        // and that does not unlock the machine, show a button to allow for resetting the machine.
        if (currentPasscode === '314159') {
          setShowFactoryReset(true)
        }
        setCurrentPasscode('')
      }
    }
  }, [currentPasscode, attemptToAuthenticateUser])

  const resetMachine = async () => {
    await saveElection(undefined)
  }

  const currentPasscodeDisplayString = '*'
    .repeat(currentPasscode.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ')

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  )
  if (showFactoryReset) {
    primarySentence = (
      <Button small warning onPress={resetMachine}>
        Factory Reset
      </Button>
    )
  } else if (showError) {
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
