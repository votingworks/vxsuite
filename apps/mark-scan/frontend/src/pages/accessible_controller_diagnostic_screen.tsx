import { useEffect, useState } from 'react';
import {
  Button,
  H2,
  H3,
  Main,
  P,
  Screen,
  ACCESSIBILITY_COMMAND_KEYS,
} from '@votingworks/ui';
import styled from 'styled-components';
import {
  ControllerButton,
  AccessibleControllerIllustration,
} from '../components/accessible_controller_illustration';
import { addDiagnosticRecord } from '../api';

const StepContainer = styled.div`
  padding: 1rem;
  margin-top: 2rem;
  display: flex;
  flex-direction: column;

  svg {
    align-self: center;
    width: 24em;
  }

  button {
    margin-top: 2rem;
  }
`;

interface DiagnosticStep {
  button: ControllerButton;
  label: string;
  key: string;
}

export const DIAGNOSTIC_STEPS: DiagnosticStep[] = [
  {
    button: 'up',
    label: 'Up',
    key: 'ArrowUp',
  },
  {
    button: 'down',
    label: 'Down',
    key: 'ArrowDown',
  },
  {
    button: 'left',
    label: 'Left',
    key: 'ArrowLeft',
  },
  {
    button: 'right',
    label: 'Right',
    key: 'ArrowRight',
  },
  {
    button: 'select',
    label: 'Select',
    key: 'Enter',
  },
  {
    button: 'help',
    label: 'Help',
    key: ACCESSIBILITY_COMMAND_KEYS['replay'],
  },
  {
    button: 'volume-down',
    label: 'Volume Down',
    key: ACCESSIBILITY_COMMAND_KEYS['decrease-volume'],
  },
  {
    button: 'volume-up',
    label: 'Volume Up',
    key: ACCESSIBILITY_COMMAND_KEYS['increase-volume'],
  },
  {
    button: 'pause',
    label: 'Pause',
    key: ACCESSIBILITY_COMMAND_KEYS['toggle-pause'],
  },
  {
    button: 'rate-down',
    label: 'Decrease Rate',
    key: ACCESSIBILITY_COMMAND_KEYS['decrease-playback-rate'],
  },
  {
    button: 'rate-up',
    label: 'Increase Rate',
    key: ACCESSIBILITY_COMMAND_KEYS['increase-playback-rate'],
  },
];

interface AccessibleControllerButtonDiagnosticProps {
  step: DiagnosticStep;
  stepIndex: number;
  onSuccess: () => void;
  onFailure: (message: string) => void;
}

function AccessibleControllerButtonDiagnostic({
  step,
  stepIndex,
  onSuccess,
  onFailure,
}: AccessibleControllerButtonDiagnosticProps) {
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
      <AccessibleControllerIllustration highlight={step.button} />

      <Button
        onPress={() =>
          onFailure(`${step.label.toLocaleLowerCase()} button is not working.`)
        }
      >
        {step.label} Button is Not Working
      </Button>
    </StepContainer>
  );
}

const CancelButtonContainer = styled.div`
  margin: 1rem;
  margin-top: 5rem;
  align-self: center;
`;

export interface AccessibleControllerDiagnosticProps {
  onClose: () => void;
}

export function AccessibleControllerDiagnosticScreen({
  onClose,
}: AccessibleControllerDiagnosticProps): JSX.Element {
  const [step, setStep] = useState(0);
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-scan-accessible-controller',
      outcome: 'pass',
    });
    onClose();
  }
  function failTest(message: string) {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-scan-accessible-controller',
      outcome: 'fail',
      message,
    });
    onClose();
  }

  function nextStep() {
    setStep((previousStep) => previousStep + 1);
  }

  const steps = [
    ...DIAGNOSTIC_STEPS.map((curStep, index) => (
      <AccessibleControllerButtonDiagnostic
        key={curStep.button}
        step={curStep}
        stepIndex={index}
        onSuccess={index === DIAGNOSTIC_STEPS.length - 1 ? passTest : nextStep}
        onFailure={failTest}
      />
    )),
  ];

  return (
    <Screen>
      <Main flexColumn padded>
        <H2>Accessible Controller Test</H2>
        <P>
          Step {step + 1} of {steps.length}
        </P>
        {steps[step]}
        <CancelButtonContainer>
          <Button icon="Delete" onPress={onClose}>
            Cancel Test
          </Button>
        </CancelButtonContainer>
      </Main>
    </Screen>
  );
}
