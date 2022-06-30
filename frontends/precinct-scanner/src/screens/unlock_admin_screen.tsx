import { fontSizeTheme, Prose, Text, NumberPad } from '@votingworks/ui';
import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { InsertedSmartcardAuth } from '@votingworks/types';
import { SECURITY_PIN_LENGTH } from '../config/globals';
import { ScreenMainCenterChild } from '../components/layout';

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;
  > div {
    width: 400px;
  }
`;

const EnteredCode = styled.div`
  margin-top: 5px;
  text-align: center;
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`;

interface Props {
  auth: InsertedSmartcardAuth.CheckingPasscode;
}

export function UnlockAdminScreen({ auth }: Props): JSX.Element {
  const [currentPasscode, setCurrentPasscode] = useState('');
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
      auth.checkPasscode(currentPasscode);
      setCurrentPasscode('');
    }
  }, [currentPasscode, auth]);

  const currentPasscodeDisplayString = '•'
    .repeat(currentPasscode.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ');

  let primarySentence: JSX.Element = (
    <p>Enter the card security code to unlock.</p>
  );
  if (auth.wrongPasscodeEntered) {
    primarySentence = <Text warning>Invalid code. Please try again.</Text>;
  }
  return (
    <ScreenMainCenterChild>
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
    </ScreenMainCenterChild>
  );
}

/* istanbul ignore next */
export function DefaultPreview(): JSX.Element {
  return (
    <UnlockAdminScreen
      auth={{
        status: 'checking_passcode',
        user: {
          role: 'admin',
          electionHash: 'preview-election-hash',
          passcode: '000000',
        },
        checkPasscode: () => undefined,
      }}
    />
  );
}
