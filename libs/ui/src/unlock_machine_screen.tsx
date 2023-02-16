import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';

import { Screen } from './screen';
import { Main } from './main';
import { Text } from './text';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';
import { NumberPad } from './number_pad';

import { SECURITY_PIN_LENGTH } from './globals';

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;
  > div {
    width: 400px;
  }
  *:focus {
    outline: none;
  }
`;

const EnteredCode = styled.div`
  margin-top: 5px;
  text-align: center;
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`;

type CheckingPinAuth =
  | DippedSmartCardAuth.CheckingPin
  | InsertedSmartCardAuth.CheckingPin;

interface Props {
  auth: CheckingPinAuth;
  checkPin: (pin: string) => void;
  grayBackground?: boolean;
}

export function UnlockMachineScreen({
  auth,
  checkPin,
  grayBackground,
}: Props): JSX.Element {
  const [currentPasscode, setCurrentPasscode] = useState('');

  const handleNumberEntry = useCallback(
    (digit: number) => {
      const passcode = `${currentPasscode}${digit}`.slice(
        0,
        SECURITY_PIN_LENGTH
      );
      setCurrentPasscode(passcode);
      if (passcode.length === SECURITY_PIN_LENGTH) {
        checkPin(passcode);
        setCurrentPasscode('');
      }
    },
    [checkPin, currentPasscode]
  );

  const handleBackspace = useCallback(() => {
    setCurrentPasscode((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setCurrentPasscode('');
  }, []);

  useEffect(() => {
    function bypassPinEntry() {
      checkPin(auth.user.passcode);
    }
    if (isFeatureFlagEnabled(BooleanEnvironmentVariableName.SKIP_PIN_ENTRY)) {
      bypassPinEntry();
    }
    // Run this hook once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPasscodeDisplayString = '•'
    .repeat(currentPasscode.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ');

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  );
  if (auth.wrongPasscodeEnteredAt) {
    primarySentence = <Text warning>Invalid code. Please try again.</Text>;
  }

  return (
    <Screen white={!grayBackground}>
      <Main centerChild>
        <Prose
          textCenter
          themeDeprecated={fontSizeTheme.medium}
          maxWidth={false}
        >
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
      </Main>
    </Screen>
  );
}
