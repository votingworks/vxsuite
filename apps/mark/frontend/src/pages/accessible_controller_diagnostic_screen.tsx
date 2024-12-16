import { useEffect, useState } from 'react';
import {
  Keybinding,
  AudioOnly,
  Button,
  Font,
  H1,
  Main,
  MarkControllerButton,
  MarkControllerIllustration,
  P,
  ReadOnLoad,
  Screen,
  appStrings,
  useAudioControls,
} from '@votingworks/ui';
import { DateTime } from 'luxon';
import styled from 'styled-components';

const Header = styled.div`
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

interface AccessibleControllerButtonDiagnosticProps {
  buttonName: string;
  buttonKey: MarkControllerButton;
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
        <H1>Press the {buttonName.toLowerCase()} button.</H1>
        <Button
          onPress={() => onFailure(`${buttonName} button is not working.`)}
        >
          {buttonName} Button is Not Working
        </Button>
      </div>
      <MarkControllerIllustration highlight={buttonKey} />
    </StepInnerContainer>
  );
}

interface AccessibleControllerSoundDiagnosticProps {
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

function AccessibleControllerSoundDiagnostic({
  onSuccess,
  onFailure,
}: AccessibleControllerSoundDiagnosticProps) {
  const [hasTriggeredAudio, setHasTriggeredAudio] = useState(false);
  const { setIsEnabled: setAudioEnabled } = useAudioControls();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === 'ArrowRight') {
        setAudioEnabled(true);
        setHasTriggeredAudio(true);
      }
      if (event.key === 'Enter' && hasTriggeredAudio) {
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [hasTriggeredAudio, onSuccess, setAudioEnabled]);

  return (
    <StepInnerContainer>
      <div>
        <H1>Confirm sound is working.</H1>
        <ol>
          <li>Plug in headphones.</li>
          <li>Press the right button to play sound.</li>
          <li>Press the select button to confirm sound is working.</li>
        </ol>
        {hasTriggeredAudio && (
          <ReadOnLoad>
            <AudioOnly>{appStrings.promptBmdSoundDiagnosticScreen()}</AudioOnly>
          </ReadOnLoad>
        )}
        <Button onPress={() => onFailure('Sound is not working.')}>
          Sound is Not Working
        </Button>
      </div>
      <MarkControllerIllustration
        highlight={Keybinding.PAGE_NEXT}
        showHeadphones
      />
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
}

export function AccessibleControllerDiagnosticScreen({
  onComplete,
  onCancel,
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

  const buttons: Array<[string, MarkControllerButton]> = [
    ['Up', Keybinding.FOCUS_PREVIOUS],
    ['Down', Keybinding.FOCUS_NEXT],
    ['Left', Keybinding.PAGE_PREVIOUS],
    ['Right', Keybinding.PAGE_NEXT],
    ['Select', Keybinding.SELECT],
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
      onSuccess={passTest}
      onFailure={failTest}
    />,
  ];

  return (
    <Screen>
      <Main centerChild>
        <Header>
          <P>
            <Font weight="bold">Accessible Controller Test</Font> &mdash; Step{' '}
            {step + 1} of {steps.length}
          </P>
          <Button onPress={onCancel}>Cancel Test</Button>
        </Header>
        <StepContainer>{steps[step]}</StepContainer>
      </Main>
    </Screen>
  );
}
