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
import styled from 'styled-components';
import { Screen } from '../components/screen';
import { ScreenReader } from '../config/types';

const Header = styled(Prose).attrs({
  maxWidth: false,
  theme: fontSizeTheme.medium,
})`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
`;

const StepContainer = styled.div`
  display: grid;
  align-items: center;
  grid-template-columns: 55% 1fr;
  flex-grow: 1;
  > img {
    justify-self: center;
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
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [buttonKey, buttonName, onSuccess]);

  return (
    <StepContainer>
      <Prose theme={fontSizeTheme.large}>
        <h1>Press the {buttonName.toLowerCase()}.</h1>
        <Button onPress={onFailure}>{buttonName} is Not Working</Button>
      </Prose>
      <img src="/images/controller-up-arrow.png" alt="up" />
    </StepContainer>
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
  screenReader: ScreenReader;
  onSuccess: () => void;
  onFailure: () => void;
}

function AccessibleControllerHeadphonesTest({
  screenReader,
  onSuccess,
  onFailure,
}: AccessibleControllerHeadphonesTestProps) {
  const [hasPlayedAudio, setHasPlayedAudio] = useState(false);

  useEffect(() => {
    async function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === 'ArrowRight') {
        const wasMuted = screenReader.isMuted();
        screenReader.unmute();
        await screenReader.speak(
          'Press the select button to confirm the audio is working.'
        );
        if (wasMuted) screenReader.mute();
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
      <Prose theme={fontSizeTheme.large}>
        <h3>
          Plug headphones into the accessible controller, then press the right
          button to play audio.
        </h3>
        <Text style={{ marginTop: '1em' }}>
          Press the select button to confirm the audio is working.
        </Text>
        <Button onPress={onFailure}>Audio is Not Working</Button>
      </Prose>
      <img src="/images/controller-up-arrow.png" alt="up" />
    </StepContainer>
  );
}

interface AccessibleControllerTestProps {
  onComplete: (results: AccessibleControllerDiagnosticResults) => void;
  onCancel: () => void;
  screenReader: ScreenReader;
}

export function AccessibleControllerTest({
  onComplete,
  onCancel,
  screenReader,
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
        screenReader={screenReader}
        onSuccess={passTest}
        onFailure={() => failTest('Audio is not working.')}
      />
    ),
  ];

  return (
    <Screen voterMode={false}>
      <Main padded style={{ paddingLeft: '3em', paddingRight: '3em' }}>
        <MainChild maxWidth={false} flexContainer>
          <Header>
            <Text>
              <strong>Accessible Controller Test</strong> &mdash; Step{' '}
              {currentStep + 1} of {steps.length}
            </Text>
            <Button onPress={onCancel}>Exit</Button>
          </Header>
          {steps[currentStep]()}
        </MainChild>
      </Main>
    </Screen>
  );
}
