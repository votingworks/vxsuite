import React, { useEffect, useState } from 'react';
import { Button, Main, MainChild, Prose, Text } from '@votingworks/ui';
import { DateTime } from 'luxon';
import styled from 'styled-components';
import { Screen } from '../components/screen';
import { ScreenReader } from '../config/types';

const Header = styled(Prose).attrs({
  maxWidth: false,
})`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
`;

const StepContainer = styled.div`
  display: grid;
  grid-template-columns: 55% 1fr;
  flex-grow: 1;
  align-items: center;

  img {
    justify-self: center;
  }

  button {
    margin-top: 4em;
  }

  ol {
    margin-top: 0;
    padding-left: 1em;
    li {
      margin-bottom: 1em;
    }
  }
`;

export type AccessibleControllerDiagnosticResults =
  | {
      passed: true;
      completedAt: DateTime;
    }
  | {
      passed: false;
      completedAt: DateTime;
      message: string;
    };

interface AccessibleControllerButtonDiagnosticProps {
  buttonName: string;
  buttonKey: string;
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

function AccessibleControllerButtonDiagnostic({
  buttonName,
  buttonKey,
  onSuccess,
  onFailure,
}: AccessibleControllerButtonDiagnosticProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === buttonKey) {
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [buttonKey, buttonName, onSuccess]);

  return (
    <StepContainer>
      <div>
        <h1>Press the {buttonName.toLowerCase()} button.</h1>
        <Button
          onPress={() => onFailure(`${buttonName} button is not working.`)}
        >
          {buttonName} Button is Not Working
        </Button>
      </div>
      <img src="/images/controller-up-arrow.png" alt="up" />
    </StepContainer>
  );
}

interface AccessibleControllerSoundDiagnosticProps {
  screenReader: ScreenReader;
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

function AccessibleControllerSoundDiagnostic({
  screenReader,
  onSuccess,
  onFailure,
}: AccessibleControllerSoundDiagnosticProps) {
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);

  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === 'ArrowRight') {
        const wasMuted = screenReader.isMuted();
        screenReader.unmute();
        await screenReader.speak(
          'Press the select button to confirm sound is working.'
        );
        screenReader.toggleMuted(wasMuted);
        setHasPlayedAudio(true);
      }
      if (event.key === 'Enter' && hasPlayedAudio) {
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [screenReader, onSuccess, hasPlayedAudio]);

  return (
    <StepContainer>
      <div>
        <h1>Confirm sound is working.</h1>
        <ol>
          <li>Plug in headphones.</li>
          <li>Press the right button to play sound.</li>
          <li>Press the select button to confirm sound is working.</li>
        </ol>
        <Button onPress={() => onFailure('Sound is not working.')}>
          Sound is Not Working
        </Button>
      </div>
      <img src="/images/controller-up-arrow.png" alt="up" />
    </StepContainer>
  );
}

export interface AccessibleControllerDiagnosticProps {
  onComplete: (results: AccessibleControllerDiagnosticResults) => void;
  onCancel: () => void;
  screenReader: ScreenReader;
}

export function AccessibleControllerDiagnosticScreen({
  onComplete,
  onCancel,
  screenReader,
}: AccessibleControllerDiagnosticProps): JSX.Element {
  const [step, setStep] = useState(0);

  function passTest() {
    onComplete({ passed: true, completedAt: DateTime.now() });
  }
  function failTest(message: string) {
    onComplete({ passed: false, completedAt: DateTime.now(), message });
  }

  function nextStep() {
    setStep((previousStep) => previousStep + 1);
  }

  const buttons = [
    ['Up', 'ArrowUp'],
    ['Down', 'ArrowDown'],
    ['Left', 'ArrowLeft'],
    ['Right', 'ArrowRight'],
    ['Select', 'Enter'],
  ];
  const steps = [
    ...buttons.map(([buttonName, buttonKey]) => (
      <AccessibleControllerButtonDiagnostic
        key={buttonName}
        buttonName={buttonName}
        buttonKey={buttonKey}
        onSuccess={nextStep}
        onFailure={failTest}
      />
    )),
    <AccessibleControllerSoundDiagnostic
      key="sound"
      screenReader={screenReader}
      onSuccess={passTest}
      onFailure={failTest}
    />,
  ];

  return (
    <Screen voterMode={false}>
      <Main style={{ padding: '2em 6em' }}>
        <MainChild maxWidth={false} flexContainer>
          <Header>
            <Text>
              <strong>Accessible Controller Test</strong> &mdash; Step{' '}
              {step + 1} of {steps.length}
            </Text>
            <Button onPress={onCancel}>Cancel Test</Button>
          </Header>
          {steps[step]}
        </MainChild>
      </Main>
    </Screen>
  );
}
