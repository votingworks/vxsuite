import { useState, useCallback } from 'react';
import styled from 'styled-components';
import { DippedSmartCardAuth, InsertedSmartCardAuth } from '@votingworks/types';
import { assert } from '@votingworks/basics';

import { Screen } from './screen.js';
import { Main } from './main.js';
import { Button } from './button.js';
import { NumberPad } from './number_pad.js';
import { useNow } from './hooks/use_now.js';
import { usePinEntry } from './hooks/use_pin_entry.js';
import { Timer } from './timer.js';
import { H1, P } from './typography.js';
import { Icons } from './icons.js';
import { PinLength } from './utils/pin_length.js';

export const SECURITY_PIN_LENGTH = PinLength.exactly(6);

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  font-size: 1em;

  > div {
    width: 12rem;
  }

  *:focus {
    outline: none;
  }
`;

const EnteredCode = styled.div`
  margin-top: 1rem;
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
  pinLength?: PinLength;
}

export function UnlockMachineScreen({
  auth,
  checkPin,
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

  const primarySentence: JSX.Element = <H1>Enter Card PIN</H1>;
  let secondarySentence = null;
  if (auth.error) {
    secondarySentence = (
      <P>
        <Icons.Danger color="danger" /> Error checking PIN. Please try again.
      </P>
    );
  } else if (isLockedOut) {
    assert(auth.lockedOutUntil !== undefined);
    secondarySentence = (
      <P>
        <Icons.Warning color="warning" /> Card locked. Please try again in{' '}
        <Timer countDownTo={new Date(auth.lockedOutUntil)} />
      </P>
    );
  } else if (auth.wrongPinEnteredAt) {
    secondarySentence = (
      <P>
        <Icons.Warning color="warning" /> Incorrect PIN. Please try again.
      </P>
    );
  }

  return (
    <Screen>
      <Main centerChild>
        {primarySentence}
        {secondarySentence}
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
      </Main>
    </Screen>
  );
}
