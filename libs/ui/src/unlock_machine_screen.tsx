import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';

import { Screen } from './screen';
import { Main } from './main';
import { Text } from './text';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';
import { NumberPad } from './number_pad';

import { SECURITY_PIN_LENGTH } from './globals';
import { P } from './typography';
import { Icons } from './icons';

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

export interface UnlockkMachineScreenProps {
  auth: CheckingPinAuth;
  checkPin: (pin: string) => void;
  grayBackground?: boolean;
}

export function UnlockMachineScreen({
  auth,
  checkPin,
  grayBackground,
}: UnlockkMachineScreenProps): JSX.Element {
  const [currentPin, setCurrentPin] = useState('');

  const handleNumberEntry = useCallback(
    (digit: number) => {
      const pin = `${currentPin}${digit}`.slice(0, SECURITY_PIN_LENGTH);
      setCurrentPin(pin);
      if (pin.length === SECURITY_PIN_LENGTH) {
        checkPin(pin);
        setCurrentPin('');
      }
    },
    [checkPin, currentPin]
  );

  const handleBackspace = useCallback(() => {
    setCurrentPin((prev) => prev.slice(0, -1));
  }, []);

  const handleClear = useCallback(() => {
    setCurrentPin('');
  }, []);

  const currentPinDisplayString = '•'
    .repeat(currentPin.length)
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ');

  let primarySentence: JSX.Element = <P>Enter the card PIN to unlock.</P>;
  if (auth.wrongPinEnteredAt) {
    primarySentence = <P color='warning' weight='semiBold'><Icons.Warning /> Invalid PIN. Please try again.</P>;
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
          <EnteredCode>{currentPinDisplayString}</EnteredCode>
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
