import React, { useEffect, useState } from 'react';
import { Button, Main, Prose, Screen, Text } from '@votingworks/ui';
import { DateTime } from 'luxon';
import styled from 'styled-components';
import { ScreenReader } from '../config/types';

type ButtonName = 'Up' | 'Down' | 'Left' | 'Right' | 'Select';

const Header = styled(Prose).attrs({
  maxWidth: false,
})`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  width: 100%;
  padding: 40px;
`;

const StepContainer = styled.div`
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 1080px;
`;

const StepInnerContainer = styled.div`
  display: flex;
  width: 100%;

  & > div {
    flex: 1;
    padding: 0 20px 0 40px;
  }

  svg {
    height: 25em;
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

interface AccessibleControllerIllustrationProps {
  highlight?: ButtonName | 'Headphones';
}

function AccessibleControllerIllustration({
  highlight,
}: AccessibleControllerIllustrationProps) {
  const defaultFill = '#fff';
  const highlightFill = '#985aa3';
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      x="0"
      y="0"
      viewBox="0 0 387.15 522"
      xmlSpace="preserve"
    >
      <title>Accessible Controller Illustration</title>
      <path d="M263.5 522H39.65c-11.21 0-20.63-8.03-22.42-19.1C5.96 433.04 0 354.02 0 274.36 0 183.71 7.6 95.24 21.99 18.52 24 7.79 33.38 0 44.31 0h214.54c10.92 0 20.31 7.79 22.32 18.52 14.38 76.72 21.99 165.19 21.99 255.84 0 79.65-5.96 158.68-17.23 228.54-1.8 11.07-11.23 19.1-22.43 19.1z" />
      <path
        fill="#fff"
        d="M44.31 10a12.72 12.72 0 0 0-12.49 10.36C17.54 96.48 10 184.32 10 274.36c0 79.13 5.91 157.61 17.1 226.95 1 6.2 6.28 10.69 12.55 10.69H263.5c6.27 0 11.55-4.5 12.55-10.69 11.19-69.34 17.1-147.82 17.1-226.95 0-90.05-7.54-177.88-21.82-254-1.12-6-6.38-10.36-12.49-10.36H44.31z"
      />
      <circle cx="192.5" cy="342.72" r="20" />
      <circle fill="#fff" cx="192.5" cy="342.72" r="10" />
      <path d="m83.97 236.68-47.8-47.8c-4.07-4.07-6.31-9.48-6.31-15.25s2.24-11.18 6.31-15.25l47.8-47.8 30.02 30.02-1.64 3.23c-1.51 2.99-2.28 6.2-2.28 9.55v39.5c0 3.54.88 7.03 2.54 10.1l1.78 3.28-30.42 30.42z" />
      <path
        data-testid="left-button"
        fill={highlight === 'Left' ? highlightFill : defaultFill}
        d="m83.97 124.73-40.73 40.73c-4.51 4.51-4.51 11.85 0 16.36l40.73 40.73 18.25-18.25c-1.41-3.61-2.15-7.5-2.15-11.41v-39.5c0-3.69.63-7.26 1.88-10.67l-17.98-17.99z"
      />
      <path d="m184.2 136.45-3.28-1.78a21.278 21.278 0 0 0-10.09-2.54h-39.51c-3.35 0-6.56.77-9.55 2.28l-3.23 1.63-30.02-30.02 47.8-47.8c4.07-4.07 9.48-6.3 15.25-6.3s11.18 2.24 15.25 6.3l47.8 47.8-30.42 30.43z" />
      <path
        data-testid="up-button"
        fill={highlight === 'Up' ? highlightFill : defaultFill}
        d="M131.32 122.14h39.51c3.91 0 7.79.74 11.4 2.15l18.25-18.25-40.73-40.74a11.48 11.48 0 0 0-8.18-3.38c-3.1 0-6 1.2-8.18 3.38l-40.73 40.73 17.98 17.98c3.42-1.24 7-1.87 10.68-1.87z"
      />
      <path d="M151.58 295.35c-5.77 0-11.19-2.24-15.25-6.31l-47.8-47.8 30.59-30.59 3.18 1.49c2.82 1.33 5.86 2 9.02 2h39.51c3.37 0 6.59-.76 9.56-2.27l3.23-1.63 31 31-47.8 47.8c-4.06 4.07-9.48 6.31-15.24 6.31z" />
      <path
        data-testid="down-button"
        fill={highlight === 'Down' ? highlightFill : defaultFill}
        d="m102.67 241.24 40.73 40.73a11.48 11.48 0 0 0 8.18 3.38c3.09 0 6-1.2 8.18-3.38l40.73-40.73-18.97-18.97c-3.4 1.24-6.98 1.87-10.68 1.87h-39.51c-3.43 0-6.76-.54-9.94-1.61l-18.72 18.71z"
      />
      <path d="m219.18 236.68-31-31.01 1.63-3.23a21.06 21.06 0 0 0 2.27-9.56v-39.51c0-3.17-.67-6.2-2-9.02l-1.49-3.18 30.6-30.6 47.8 47.8c4.07 4.07 6.3 9.48 6.3 15.25s-2.24 11.18-6.3 15.25l-47.81 47.81z" />
      <path
        data-testid="right-button"
        fill={
          highlight === 'Right' || highlight === 'Headphones'
            ? highlightFill
            : defaultFill
        }
        d="m200.21 203.57 18.98 18.98 40.73-40.73a11.48 11.48 0 0 0 3.38-8.18c0-3.1-1.2-6-3.38-8.18l-40.73-40.73-18.71 18.71c1.07 3.18 1.61 6.51 1.61 9.94v39.51c-.02 3.7-.64 7.27-1.88 10.68z"
      />
      <path d="M169.52 209.42h-36.89c-4.76 0-9.24-1.85-12.61-5.22a17.715 17.715 0 0 1-5.22-12.61V154.7c0-9.83 8-17.83 17.83-17.83h36.89c4.76 0 9.24 1.85 12.61 5.22 3.37 3.37 5.22 7.85 5.22 12.61v36.89c0 4.76-1.85 9.24-5.22 12.61s-7.85 5.22-12.61 5.22z" />
      <path
        data-testid="select-button"
        fill={highlight === 'Select' ? highlightFill : defaultFill}
        d="M132.63 146.86c-4.32 0-7.83 3.51-7.83 7.83v36.89c0 2.09.81 4.06 2.29 5.54a7.783 7.783 0 0 0 5.54 2.29h36.89c2.09 0 4.06-.81 5.54-2.29s2.29-3.45 2.29-5.54v-36.89c0-2.09-.81-4.06-2.29-5.54a7.783 7.783 0 0 0-5.54-2.29h-36.89z"
      />
      <path d="M194.13 466.64h-3.26c-21.76 0-39.47-17.7-39.47-39.47v-86.08c0-21.76 17.7-39.47 39.47-39.47h3.26c21.76 0 39.47 17.7 39.47 39.47v86.08c-.01 21.76-17.71 39.47-39.47 39.47zm-3.27-155.01c-16.25 0-29.47 13.22-29.47 29.47v86.08c0 16.25 13.22 29.47 29.47 29.47h3.26c16.25 0 29.47-13.22 29.47-29.47V341.1c0-16.25-13.22-29.47-29.47-29.47h-3.26z" />
      <path d="M215.49 424.8c0-12.83-10.44-23.27-23.27-23.27s-23.27 10.44-23.27 23.27c0 6.79 2.93 12.9 7.58 17.16.48 2.61 2.78 4.61 5.52 4.61 3.09 0 5.62-2.53 5.62-5.62v-7.09c0-3.09-2.53-5.62-5.62-5.62-2.53 0-4.69 1.7-5.38 4.01a17.051 17.051 0 0 1-1.72-7.44c0-9.52 7.75-17.27 17.27-17.27s17.27 7.75 17.27 17.27c0 2.67-.62 5.2-1.71 7.46-.69-2.32-2.85-4.03-5.39-4.03-3.09 0-5.62 2.53-5.62 5.62v7.09c0 3.09 2.53 5.62 5.62 5.62 2.75 0 5.04-2 5.52-4.61 4.66-4.26 7.58-10.37 7.58-17.16zM119.87 373.03H87.29c-9.3 0-16.87-7.57-16.87-16.87v-32.57c0-9.3 7.57-16.87 16.87-16.87h32.57c9.3 0 16.87 7.57 16.87 16.87v32.57c.01 9.31-7.56 16.87-16.86 16.87zm-32.58-56.31c-3.79 0-6.87 3.08-6.87 6.87v32.57c0 3.79 3.08 6.87 6.87 6.87h32.57c3.79 0 6.87-3.08 6.87-6.87v-32.57c0-3.79-3.08-6.87-6.87-6.87H87.29z" />
      <path d="M90.81 357.38c-2.76 0-5-2.24-5-5v-3c0-2.76 2.24-5 5-5s5 2.24 5 5v3c0 2.76-2.24 5-5 5zM103.58 357.38c-2.76 0-5-2.24-5-5v-14c0-2.76 2.24-5 5-5s5 2.24 5 5v14c0 2.76-2.24 5-5 5zM116.35 357.38c-2.76 0-5-2.24-5-5v-25c0-2.76 2.24-5 5-5s5 2.24 5 5v25c0 2.76-2.24 5-5 5z" />
      {highlight === 'Headphones' && (
        <g>
          <path
            data-testid="headphones"
            fill={highlightFill}
            d="m198.68 369.38-19.34-4.36-13.94-27.72 22.78-18.78 19.86 5.02 11.35 25.14 77.63 76.37-20.72 22.52z"
          />
          <path d="M361.3 413.79c-8.41 7.93-8.2 20.89-8.02 32.33.21 13.37-.14 21.71-6.77 24.8-13.67 6.37-22.49-1.93-45.98-26.87-1.86-1.97-3.8-4.03-5.81-6.15l2-2c5.26-5.26 5.26-13.82 0-19.08l-75.29-75.29c-.25-7.08-3.06-14.09-8.46-19.49-5.48-5.48-12.76-8.5-20.51-8.5-7.75 0-15.03 3.02-20.51 8.5s-8.5 12.76-8.5 20.51c0 7.75 3.02 15.03 8.5 20.51 5.65 5.65 13.08 8.48 20.51 8.48.08 0 .17-.01.25-.01l74.64 74.64c2.55 2.55 5.94 3.95 9.54 3.95 3.6 0 6.99-1.4 9.54-3.95l1.2-1.2c1.94 2.05 3.81 4.03 5.61 5.94 17.93 19.03 30.27 32.13 44.88 32.13 3.98 0 8.12-.97 12.59-3.05 12.99-6.05 12.75-20.91 12.55-34.02-.15-9.83-.31-19.99 4.89-24.9 3.43-3.24 9.57-4.55 18.25-3.91l.74-9.97c-11.75-.88-20.2 1.28-25.84 6.6zM179.02 329.1c3.71-3.71 8.57-5.56 13.44-5.56 4.87 0 9.73 1.85 13.44 5.56 7.41 7.41 7.41 19.47 0 26.88s-19.47 7.41-26.88 0-7.41-19.47 0-26.88zm110.63 99.72-10.28 10.28c-1.32 1.32-3.62 1.32-4.94 0l-70.1-70.1c3.14-1.4 6.07-3.38 8.64-5.95 2.81-2.81 4.92-6.05 6.33-9.52l70.35 70.35a3.5 3.5 0 0 1 0 4.94z" />
        </g>
      )}
    </svg>
  );
}

interface AccessibleControllerButtonDiagnosticProps {
  buttonName: ButtonName;
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
    <StepInnerContainer>
      <div>
        <h1>Press the {buttonName.toLowerCase()} button.</h1>
        <Button
          onPress={() => onFailure(`${buttonName} button is not working.`)}
        >
          {buttonName} Button is Not Working
        </Button>
      </div>
      <AccessibleControllerIllustration highlight={buttonName} />
    </StepInnerContainer>
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
    <StepInnerContainer>
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
      <AccessibleControllerIllustration highlight="Headphones" />
    </StepInnerContainer>
  );
}

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

  const buttons: Array<[ButtonName, string]> = [
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
    <Screen>
      <Main centerChild>
        <Header>
          <Text>
            <strong>Accessible Controller Test</strong> &mdash; Step {step + 1}{' '}
            of {steps.length}
          </Text>
          <Button onPress={onCancel}>Cancel Test</Button>
        </Header>
        <StepContainer>{steps[step]}</StepContainer>
      </Main>
    </Screen>
  );
}
