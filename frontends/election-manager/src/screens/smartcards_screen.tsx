import React, { useCallback, useContext, useState } from 'react';
import {
  isAdminAuth,
  isSuperadminAuth,
  Modal,
  NumberPad,
  Prose,
  useCancelablePromise,
  SECURITY_PIN_LENGTH,
} from '@votingworks/ui';
import styled from 'styled-components';
import { assert, sleep } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';

import { AppContext } from '../contexts/app_context';
import { Button } from '../components/button';
import { Loading } from '../components/loading';
import { NavigationScreen } from '../components/navigation_screen';

const Passcode = styled.div`
  text-align: center;
  color: rgba(71, 167, 75, 1);
  font-family: monospace;
  font-size: 1.5em;
  font-weight: 600;
`;

const NumberPadWrapper = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 10px;
  > div {
    width: 300px;
  }
`;

export function SmartcardsScreen(): JSX.Element {
  const { electionDefinition, logger, auth } = useContext(AppContext);
  assert(electionDefinition);
  assert(isAdminAuth(auth) || isSuperadminAuth(auth)); // TODO(auth) check permissions for writing smartcards
  const userRole = auth.user.role;
  const { electionData, electionHash } = electionDefinition;

  const makeCancelable = useCancelablePromise();

  const [isProgrammingCard, setIsProgrammingCard] = useState(false);
  const [isPromptingForAdminPasscode, setIsPromptingForAdminPasscode] =
    useState(false);
  const [currentPasscode, setCurrentPasscode] = useState('');

  const [isShowingError, setIsShowingError] = useState(false);
  function closeErrorDialog() {
    return setIsShowingError(false);
  }

  async function overrideWriteProtection() {
    await logger.log(LogEventId.SmartcardProgramInit, userRole, {
      message: 'Overriding write protection on the current smartcard...',
    });
    setIsProgrammingCard(true);
    const response = await fetch('/card/write_protect_override', {
      method: 'post',
    });
    const body = await response.json();
    if (!body.success) {
      await logger.log(
        LogEventId.SmartcardProgrammedOverrideWriteProtection,
        userRole,
        {
          message: 'Error in overriding write protection on smartcard',
          disposition: 'failure',
          result: 'Write protection NOT overridden.',
        }
      );
    } else {
      await logger.log(
        LogEventId.SmartcardProgrammedOverrideWriteProtection,
        userRole,
        {
          message:
            'Write protection successfully overridden on the current smartcard.',
          disposition: 'success',
        }
      );
    }
    await makeCancelable(sleep(1000));
    setIsProgrammingCard(false);
  }

  async function programPollWorkerCard() {
    await logger.log(LogEventId.SmartcardProgramInit, userRole, {
      message: 'Programming a pollworker card...',
      programmedUserType: 'pollworker',
    });
    setIsProgrammingCard(true);

    const shortValue = JSON.stringify({
      t: 'pollworker',
      h: electionHash,
    });
    const response = await fetch('/card/write', {
      method: 'post',
      body: shortValue,
    });
    const body = await response.json();
    if (!body.success) {
      setIsShowingError(true);
      await logger.log(LogEventId.SmartcardProgrammed, userRole, {
        message: 'Error in programming pollworker card',
        programmedUserType: 'pollworker',
        disposition: 'failure',
        result: 'Card not updated, error message shown to user.',
      });
    } else {
      await logger.log(LogEventId.SmartcardProgrammed, userRole, {
        message: 'Successfully finished programming a pollworker card.',
        programmedUserType: 'pollworker',
        disposition: 'success',
      });
    }
    setIsProgrammingCard(false);
  }
  async function programAdminCard(passcode: string) {
    // automatically override write protection when writing a new admin card
    await overrideWriteProtection();

    await logger.log(LogEventId.SmartcardProgramInit, userRole, {
      message: 'Programming an admin card...',
      programmedUserType: 'admin',
    });
    setIsProgrammingCard(true);
    setIsPromptingForAdminPasscode(false);
    const shortValue = JSON.stringify({
      t: 'admin',
      h: electionHash,
      p: passcode,
    });
    const longValue = electionData;

    // We submit a form with x-www-form-urlencoded encoding, because multipart encoding can change LF into CRLF,
    // which screws up the hash of the election data, which is bad news.
    //
    // It would be nice if FormData had a way of specifying x-www-form-urlencoded encoding, but it does not.
    // So we put together this request with a little bit of manual duct tape.
    const response = await fetch('/card/write_short_and_long', {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      method: 'post',
      body: `short_value=${encodeURIComponent(
        shortValue
      )}&long_value=${encodeURIComponent(longValue)}`,
    });

    const body = await response.json();
    if (!body.success) {
      setIsShowingError(true);
      await logger.log(LogEventId.SmartcardProgrammed, userRole, {
        message: 'Error in programming admin card',
        programmedUserType: 'admin',
        disposition: 'failure',
        result: 'Card not updated, error message shown to user.',
      });
    } else {
      await logger.log(LogEventId.SmartcardProgrammed, userRole, {
        message: 'Successfully finished programming an admin card.',
        programmedUserType: 'admin',
        disposition: 'success',
      });
    }

    setIsProgrammingCard(false);
  }

  function initiateAdminCardProgramming() {
    setCurrentPasscode('');
    setIsPromptingForAdminPasscode(true);
  }

  const addNumberToPin = useCallback((digit: number) => {
    setCurrentPasscode((prev) =>
      prev.length >= SECURITY_PIN_LENGTH ? prev : `${prev}${digit}`
    );
  }, []);

  const deleteFromEndOfPin = useCallback(() => {
    setCurrentPasscode((prev) => prev.slice(0, -1));
  }, []);

  const clearPin = useCallback(() => {
    setCurrentPasscode('');
  }, []);

  // Add hyphens for any missing digits in the pin and separate all characters with a space.
  const pinDisplayString = currentPasscode
    .padEnd(SECURITY_PIN_LENGTH, '-')
    .split('')
    .join(' ');
  const readyToProgramAdminCard =
    currentPasscode.length === SECURITY_PIN_LENGTH;

  return (
    <React.Fragment>
      <NavigationScreen>
        <Prose maxWidth={false}>
          <h1>Smartcards</h1>
          <p>
            Insert a card into the reader and then select the type of card to
            create.
          </p>
          <p>
            <Button onPress={initiateAdminCardProgramming} data-id="admin">
              Encode Admin Card
            </Button>{' '}
            <Button onPress={programPollWorkerCard}>
              Encode Poll Worker Card
            </Button>
          </p>
          <p>
            You will first need to override write protection before
            re-programming an existing Admin card.
          </p>
          <p>
            <Button small onPress={overrideWriteProtection}>
              Override Write Protection
            </Button>
          </p>
          {isProgrammingCard && <p>Is programming card…</p>}
        </Prose>
      </NavigationScreen>
      {isProgrammingCard && (
        <Modal content={<Loading>Programming card</Loading>} />
      )}
      {isShowingError && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Failed to Create Card</h1>
              <p>
                Please make sure a card is in the card reader and try again. If
                you are trying to reprogram an existing admin card you first
                need to overwrite write protection.
              </p>
            </Prose>
          }
          actions={<Button onPress={closeErrorDialog}>Close</Button>}
          onOverlayClick={closeErrorDialog}
        />
      )}
      {isPromptingForAdminPasscode && (
        <Modal
          content={
            <Prose textCenter>
              <h1>Create Card Security Code</h1>
              <Passcode>{pinDisplayString}</Passcode>
              <NumberPadWrapper>
                <NumberPad
                  onButtonPress={addNumberToPin}
                  onBackspace={deleteFromEndOfPin}
                  onClear={clearPin}
                  onEnter={() =>
                    readyToProgramAdminCard && programAdminCard(currentPasscode)
                  }
                />
              </NumberPadWrapper>
              <p>This code will be required when using the new card.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button
                primary
                disabled={!readyToProgramAdminCard}
                onPress={() => programAdminCard(currentPasscode)}
              >
                Create Card
              </Button>
              <Button onPress={() => setIsPromptingForAdminPasscode(false)}>
                Cancel
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
