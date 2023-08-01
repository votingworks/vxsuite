import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import { assert } from '@votingworks/basics';

import { Screen } from './screen';
import { Main } from './main';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';
import { NumberPad } from './number_pad';
import { SECURITY_PIN_LENGTH } from './globals';
import { useNow } from './hooks/use_now';
import { Timer } from './timer';
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

interface Props {
  auth: CheckingPinAuth;
  checkPin: (pin: string) => Promise<void>;
  grayBackground?: boolean;
}

export function UnlockMachineScreen({
  auth,
  checkPin,
  grayBackground,
}: Props): JSX.Element {
  const [currentPin, setCurrentPin] = useState('');
  const [isCheckingPin, setIsCheckingPin] = useState(false);
  const now = useNow().toJSDate();

  const handleNumberEntry = useCallback(
    async (digit: number) => {
      const pin = `${currentPin}${digit}`.slice(0, SECURITY_PIN_LENGTH);
      setCurrentPin(pin);
      if (pin.length === SECURITY_PIN_LENGTH) {
        setIsCheckingPin(true);
        await checkPin(pin);
        setCurrentPin('');
        setIsCheckingPin(false);
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

  const isLockedOut = Boolean(
    auth.lockedOutUntil && now < new Date(auth.lockedOutUntil)
  );

  let primarySentence: JSX.Element = <P>Enter the card PIN to unlock.</P>;
  if (auth.error) {
    primarySentence = (
      <P color="danger">
        <Icons.Danger /> Error checking PIN. Please try again.
      </P>
    );
  } else if (isLockedOut) {
    assert(auth.lockedOutUntil !== undefined);
    primarySentence = (
      <P color="warning">
        <Icons.Warning /> Card locked. Please try again in{' '}
        <Timer countDownTo={new Date(auth.lockedOutUntil)} />
      </P>
    );
  } else if (auth.wrongPinEnteredAt) {
    primarySentence = (
      <P color="warning">
        <Icons.Warning /> Incorrect PIN. Please try again.
      </P>
    );
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
              disabled={isCheckingPin || isLockedOut}
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
