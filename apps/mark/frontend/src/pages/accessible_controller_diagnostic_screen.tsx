import { useEffect, useState } from 'react';
import styled from 'styled-components';
import {
  Button,
  H2,
  H3,
  Keybinding,
  Main,
  type MarkControllerButton,
  MarkControllerIllustration,
  P,
  Screen,
} from '@votingworks/ui';
import { assertDefined } from '@votingworks/basics';
import { addDiagnosticRecord } from '../api.js';

const StepContainer = styled.div`
  padding: 1rem;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;

  svg {
    align-self: center;
    height: 24em;
  }

  button {
    margin-top: 2rem;
  }
`;

const CancelButtonContainer = styled.div`
  margin: 1rem;
  margin-top: 5rem;
  align-self: center;
`;

interface DiagnosticStep {
  label: string;
  key: MarkControllerButton;
}

export const DIAGNOSTIC_STEPS: readonly DiagnosticStep[] = [
  { label: 'Up', key: Keybinding.FOCUS_PREVIOUS },
  { label: 'Down', key: Keybinding.FOCUS_NEXT },
  { label: 'Left', key: Keybinding.PAGE_PREVIOUS },
  { label: 'Right', key: Keybinding.PAGE_NEXT },
  { label: 'Select', key: Keybinding.SELECT },
  { label: 'Volume Up', key: Keybinding.VOLUME_UP },
  { label: 'Volume Down', key: Keybinding.VOLUME_DOWN },
  { label: 'Pause', key: Keybinding.TOGGLE_PAUSE },
  { label: 'Help', key: Keybinding.TOGGLE_HELP },
];

interface ButtonDiagnosticStepProps {
  step: DiagnosticStep;
  stepIndex: number;
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

function ButtonDiagnosticStep({
  step,
  stepIndex,
  onSuccess,
  onFailure,
}: ButtonDiagnosticStepProps): JSX.Element {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === step.key) {
        onSuccess();
      }
    }
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [onSuccess, step.key]);

  return (
    <StepContainer>
      <H3>
        {stepIndex + 1}. Press the {step.label.toLowerCase()} button.
      </H3>
      <MarkControllerIllustration highlight={step.key} />
      <Button
        onPress={() =>
          onFailure(`${step.label.toLowerCase()} button is not working.`)
        }
      >
        {step.label} Button is Not Working
      </Button>
    </StepContainer>
  );
}

export interface AccessibleControllerDiagnosticScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function AccessibleControllerDiagnosticScreen({
  onComplete,
  onCancel,
}: AccessibleControllerDiagnosticScreenProps): JSX.Element {
  const [stepIndex, setStepIndex] = useState(0);
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-accessible-controller',
      outcome: 'pass',
    });
    onComplete();
  }

  function failTest(message: string) {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-accessible-controller',
      outcome: 'fail',
      message,
    });
    onComplete();
  }

  function nextStep() {
    setStepIndex((previousStepIndex) => previousStepIndex + 1);
  }

  const isLastStep = stepIndex === DIAGNOSTIC_STEPS.length - 1;
  const step = assertDefined(DIAGNOSTIC_STEPS[stepIndex]);

  return (
    <Screen>
      <Main flexColumn padded>
        <H2>Accessible Controller Test</H2>
        <P>
          Step {stepIndex + 1} of {DIAGNOSTIC_STEPS.length}
        </P>
        <ButtonDiagnosticStep
          key={step.key}
          step={step}
          stepIndex={stepIndex}
          onSuccess={isLastStep ? passTest : nextStep}
          onFailure={failTest}
        />
        <CancelButtonContainer>
          <Button icon="Cancel" onPress={onCancel}>
            Cancel Test
          </Button>
        </CancelButtonContainer>
      </Main>
    </Screen>
  );
}
