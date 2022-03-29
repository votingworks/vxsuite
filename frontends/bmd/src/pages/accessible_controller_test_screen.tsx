import React, { useEffect, useState } from 'react';
import {
  Button,
  fontSizeTheme,
  Main,
  MainChild,
  Prose,
  Text,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
// import styled from 'styled-components';
import { Screen } from '../components/screen';

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

interface AccessibleControllerButtonTestProps {
  buttonName: string;
  buttonKey: string;
  onSuccess: () => void;
  onFailure: () => void;
}

function AccessibleControllerButtonTest({
  buttonName,
  buttonKey,
  onSuccess,
  onFailure,
}: AccessibleControllerButtonTestProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === buttonKey) {
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [buttonKey, onSuccess]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Prose theme={fontSizeTheme.large} textCenter>
        <h1 style={{ margin: '2em 2em' }}>Press the {buttonName}</h1>
        <Button onPress={onFailure}>{buttonName} is Not Working</Button>
      </Prose>
      <img src="/images/controller-up-arrow.png" alt="up" />
    </div>
  );
}

// // https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm
// function shuffle<T>(array: T[]): T[] {
//   const shuffled = array.slice();
//   for (let i = shuffled.length - 1; i > 0; i -= 1) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
//   }
//   return shuffled;
// }

interface AccessibleControllerHeadphonesTestProps {
  onSuccess: () => void;
  onFailure: () => void;
}

function AccessibleControllerHeadphonesTest({
  onSuccess,
  onFailure,
}: AccessibleControllerHeadphonesTestProps) {
  const instructions =
    'Press the select button to confirm the audio is working.';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === 'Enter') {
        // TODO play audio
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSuccess]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Prose theme={fontSizeTheme.large} textCenter>
        <h3 style={{ margin: '2em 2em' }}>
          Plug the Headphones Into the Accessible Controller, Then Press the Up
          Button to Play Audio.
        </h3>
        <Text>{instructions}</Text>
        <Button onPress={onFailure}>Audio is Not Working</Button>
      </Prose>
      <img
        style={{ display: 'inline' }}
        src="/images/controller-up-arrow.png"
        alt="up"
      />
    </div>
  );
}

interface AccessibleControllerTestProps {
  onComplete: (results: AccessibleControllerDiagnosticResults) => void;
  onCancel: () => void;
}

export function AccessibleControllerTest({
  onComplete,
  onCancel,
}: AccessibleControllerTestProps): JSX.Element {
  const [currentStep, setCurrentStep] = useState(0);

  function passTest() {
    onComplete({ passed: true, completedAt: DateTime.now() });
  }
  function failTest(message: string) {
    onComplete({ passed: false, completedAt: DateTime.now(), message });
  }

  function nextStep() {
    setCurrentStep((previousStep) => previousStep + 1);
  }

  const steps = [
    () => (
      <AccessibleControllerButtonTest
        buttonName="Up Button"
        buttonKey="ArrowUp"
        onSuccess={nextStep}
        onFailure={() => failTest('Up button is not working.')}
      />
    ),
    () => (
      <AccessibleControllerButtonTest
        buttonName="Down Button"
        buttonKey="ArrowDown"
        onSuccess={nextStep}
        onFailure={() => failTest('Down button is not working.')}
      />
    ),
    () => (
      <AccessibleControllerButtonTest
        buttonName="Left Button"
        buttonKey="ArrowLeft"
        onSuccess={nextStep}
        onFailure={() => failTest('Left button is not working.')}
      />
    ),
    () => (
      <AccessibleControllerButtonTest
        buttonName="Right Button"
        buttonKey="ArrowRight"
        onSuccess={nextStep}
        onFailure={() => failTest('Right button is not working.')}
      />
    ),
    () => (
      <AccessibleControllerButtonTest
        buttonName="Select Button"
        buttonKey="Enter"
        onSuccess={nextStep}
        onFailure={() => failTest('Select button is not working.')}
      />
    ),
    () => (
      <AccessibleControllerHeadphonesTest
        onSuccess={passTest}
        onFailure={() => failTest('Audio is not working.')}
      />
    ),
  ];

  return (
    <Screen voterMode={false}>
      <Main padded>
        <MainChild maxWidth={false}>
          <Prose
            maxWidth={false}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              margin: '0.5em 2em 1em 2em',
              alignItems: 'baseline',
            }}
            theme={fontSizeTheme.medium}
          >
            <Text>
              <strong>Accessible Controller Test</strong> &mdash; Step{' '}
              {currentStep + 1} of {steps.length}
            </Text>
            <Button onPress={onCancel}>Exit</Button>
          </Prose>
          {steps[currentStep]()}
        </MainChild>
      </Main>
    </Screen>
  );
}
