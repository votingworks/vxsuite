import {
  Button,
  fontSizeTheme,
  Main,
  MainChild,
  NumberPad,
  Prose,
  Text,
  ElectionInfoBar,
} from '@votingworks/ui';
import React, { useState, useContext, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Screen } from '../components/screen';
import { SECURITY_PIN_LENGTH } from '../config/globals';
import { AppContext } from '../contexts/app_context';

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;
  > div {
    width: 400px;
  }
`;

export const EnteredCode = styled.div`
  margin-top: 5px;
  text-align: center;
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`;

export function UnlockMachineScreen(): JSX.Element {
  const {
    attemptToAuthenticateAdminUser,
    saveElection,
    electionDefinition,
    machineConfig,
  } = useContext(AppContext);
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [showError, setShowError] = useState(false);
  // This is temporary while we improve the bootstrapping process. If PI is entered
  // and that does not unlock the machine, show a button to allow for resetting the machine.
  const [showFactoryReset, setShowFactoryReset] = useState(false);
  const handleNumberEntry = useCallback((digit: number) => {
    setCurrentPasscode((prev) =>
      `${prev}${digit}`.slice(0, SECURITY_PIN_LENGTH)
    );
  }, []);
  const handleBackspace = useCallback(() => {
    setCurrentPasscode((prev) => prev.slice(0, -1));
  }, []);
  const handleClear = useCallback(() => {
    setCurrentPasscode('');
  }, []);

  useEffect(() => {
    if (currentPasscode.length === SECURITY_PIN_LENGTH) {
      const success = attemptToAuthenticateAdminUser(currentPasscode);
      // This is temporary while we improve the bootstrapping process. If PI is entered
      // and that does not unlock the machine, show a button to allow for resetting the machine.
      setShowFactoryReset(currentPasscode === '314159');
      setShowError(!success);
      setCurrentPasscode('');
    }
  }, [currentPasscode, attemptToAuthenticateAdminUser]);

  const resetMachine = useCallback(async () => {
    await saveElection(undefined);
  }, [saveElection]);

  const currentPasscodeDisplayString = '•'
    .repeat(currentPasscode.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ');

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  );
  if (showFactoryReset) {
    primarySentence = (
      <Button small danger onPress={resetMachine}>
        Remove Current Election
      </Button>
    );
  } else if (showError) {
    primarySentence = <Text warning>Invalid code. Please try again.</Text>;
  }
  return (
    <Screen>
      <Main>
        <MainChild center>
          <Prose textCenter theme={fontSizeTheme.medium} maxWidth={false}>
            {primarySentence}
            <EnteredCode>{currentPasscodeDisplayString}</EnteredCode>
            <NumberPadWrapper>
              <NumberPad
                onButtonPress={handleNumberEntry}
                onBackspace={handleBackspace}
                onClear={handleClear}
              />
            </NumberPadWrapper>
          </Prose>
        </MainChild>
      </Main>
      <ElectionInfoBar
        mode="admin"
        electionDefinition={electionDefinition}
        codeVersion={machineConfig.codeVersion}
        machineId={machineConfig.machineId}
      />
    </Screen>
  );
}
