import { strict as assert } from 'assert';
import React, { useCallback, useContext, useState } from 'react';

import { NumberPad, useCancelablePromise } from '@votingworks/ui';
import styled from 'styled-components';
import { sleep } from '@votingworks/utils';
import { LogEventId } from '@votingworks/logging';
import { AppContext } from '../contexts/app_context';

import { NavigationScreen } from '../components/navigation_screen';
import { Prose } from '../components/prose';
import { Button } from '../components/button';
import { Modal } from '../components/modal';
import { Loading } from '../components/loading';
import { SECURITY_PIN_LENGTH } from '../config/globals';

export const Passcode = styled.div`
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
  const { electionDefinition, logger, currentUserSession } = useContext(
    AppContext
  );
  assert(electionDefinition);
  const { electionData, electionHash } = electionDefinition;

  const makeCancelable = useCancelablePromise();

  const [isProgrammingCard, setIsProgrammingCard] = useState(false);
  const [
    isPromptingForAdminPasscode,
    setIsPromptingForAdminPasscode,
  ] = useState(false);
  const [currentPasscode, setCurrentPasscode] = useState('');

  const [isShowingError, setIsShowingError] = useState(false);
  function closeErrorDialog() {
    return setIsShowingError(false);
  }

  async function overrideWriteProtection() {
    assert(currentUserSession); // TODO(auth) check permissions for writing smartcards
    await logger.log(LogEventId.SmartcardProgramInit, currentUserSession.type, {
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
        currentUserSession.type,
        {
          message: 'Error in overriding write protection on smartcard',
          disposition: 'failure',
          result: 'Write protection NOT overridden.',
        }
      );
    } else {
      await logger.log(
        LogEventId.SmartcardProgrammedOverrideWriteProtection,
        currentUserSession.type,
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
    assert(currentUserSession); // TODO(auth) check permissions for writing smartcards
    await logger.log(LogEventId.SmartcardProgramInit, currentUserSession.type, {
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
      await logger.log(
        LogEventId.SmartcardProgrammed,
        currentUserSession.type,
        {
          message: 'Error in programming pollworker card',
          programmedUserType: 'pollworker',
          disposition: 'failure',
          result: 'Card not updated, error message shown to user.',
        }
      );
    } else {
      await logger.log(
        LogEventId.SmartcardProgrammed,
        currentUserSession.type,
        {
          message: 'Successfully finished programming a pollworker card.',
          programmedUserType: 'pollworker',
          disposition: 'success',
        }
      );
    }
    setIsProgrammingCard(false);
  }
  async function programAdminCard(passcode: string) {
    assert(currentUserSession); // TODO(auth) check permissions for writing smartcards
    await logger.log(LogEventId.SmartcardProgramInit, currentUserSession.type, {
      message: 'Programming an admin card...',
      programmedUserType: 'admin',
    });
    const formData = new FormData();
    setIsProgrammingCard(true);
    setIsPromptingForAdminPasscode(false);
    const shortValue = JSON.stringify({
      t: 'admin',
      h: electionHash,
      p: passcode,
    });
    formData.append('short_value', shortValue);
    formData.append('long_value', electionData);
    const response = await fetch('/card/write_short_and_long', {
      method: 'post',
      body: formData,
    });
    const body = await response.json();
    if (!body.success) {
      setIsShowingError(true);
      await logger.log(
        LogEventId.SmartcardProgrammed,
        currentUserSession.type,
        {
          message: 'Error in programming admin card',
          programmedUserType: 'admin',
          disposition: 'failure',
          result: 'Card not updated, error message shown to user.',
        }
      );
    } else {
      await logger.log(
        LogEventId.SmartcardProgrammed,
        currentUserSession.type,
        {
          message: 'Successfully finished programming an admin card.',
          programmedUserType: 'admin',
          disposition: 'success',
        }
      );
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

  return (
    <React.Fragment>
      <NavigationScreen mainChildFlex>
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
                />
              </NumberPadWrapper>
              <p>This code will be required when using the new card.</p>
            </Prose>
          }
          actions={
            <React.Fragment>
              <Button onPress={() => setIsPromptingForAdminPasscode(false)}>
                Cancel
              </Button>
              <Button
                primary
                disabled={currentPasscode.length !== SECURITY_PIN_LENGTH}
                onPress={() => programAdminCard(currentPasscode)}
              >
                Create Card
              </Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}
