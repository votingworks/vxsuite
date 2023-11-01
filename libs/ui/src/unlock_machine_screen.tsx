import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import { assert } from '@votingworks/basics';

import { Screen } from './screen';
import { Main } from './main';
import { Prose } from './prose';
import { fontSizeTheme } from './themes';
import { Button } from './button';
import { NumberPad } from './number_pad';
import { SECURITY_PIN_LENGTH } from './globals';
import { useNow } from './hooks/use_now';
import { usePinEntry } from './hooks/use_pin_entry';
import { Timer } from './timer';
import { P } from './typography';
import { Icons } from './icons';
import { PinLength } from './utils/pin_length';

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

export interface UnlockMachineScreenProps {
  auth: CheckingPinAuth;
  checkPin: (pin: string) => Promise<void>;
  grayBackground?: boolean;
  pinLength?: PinLength;
}

export function UnlockMachineScreen({
  auth,
  checkPin,
  grayBackground,
  pinLength = SECURITY_PIN_LENGTH,
}: UnlockMachineScreenProps): JSX.Element {
  const pinEntry = usePinEntry({ pinLength });
  const [isCheckingPin, setIsCheckingPin] = useState(false);
  const now = useNow().toJSDate();

  const doCheckPin = useCallback(
    async (pin: string) => {
      setIsCheckingPin(true);
      await checkPin(pin);
      pinEntry.setCurrent('');
      setIsCheckingPin(false);
    },
    [checkPin, pinEntry]
  );

  const handleNumberEntry = useCallback(
    async (number: number) => {
      const pin = pinEntry.handleDigit(number);
      if (pin.length === pinLength.max) {
        await doCheckPin(pin);
      }
    },
    [doCheckPin, pinEntry, pinLength.max]
  );

  const handleEnter = useCallback(async () => {
    await doCheckPin(pinEntry.current);
  }, [doCheckPin, pinEntry]);

  const isLockedOut = Boolean(
    auth.lockedOutUntil && now < new Date(auth.lockedOutUntil)
  );

  let primarySentence: JSX.Element = <P>Enter the card PIN to unlock.</P>;
  if (auth.error) {
    primarySentence = (
      <P>
        <Icons.Danger color="danger" /> Error checking PIN. Please try again.
      </P>
    );
  } else if (isLockedOut) {
    assert(auth.lockedOutUntil !== undefined);
    primarySentence = (
      <P>
        <Icons.Warning color="warning" /> Card locked. Please try again in{' '}
        <Timer countDownTo={new Date(auth.lockedOutUntil)} />
      </P>
    );
  } else if (auth.wrongPinEnteredAt) {
    primarySentence = (
      <P>
        <Icons.Warning color="warning" /> Incorrect PIN. Please try again.
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
          <EnteredCode>{pinEntry.display}</EnteredCode>
          <NumberPadWrapper>
            <NumberPad
              disabled={isCheckingPin || isLockedOut}
              onButtonPress={handleNumberEntry}
              onBackspace={pinEntry.handleBackspace}
              onClear={pinEntry.reset}
            />
            {!pinLength.isFixed && <Button onPress={handleEnter}>Enter</Button>}
          </NumberPadWrapper>
        </Prose>
      </Main>
    </Screen>
  );
}
