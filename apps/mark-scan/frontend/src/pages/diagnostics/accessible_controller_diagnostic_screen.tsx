import { useEffect, useState } from 'react';
import {
  Button,
  H2,
  H3,
  Main,
  P,
  Screen,
  MarkScanControllerIllustration,
  MarkScanControllerButton,
  Keybinding,
} from '@votingworks/ui';
import { addDiagnosticRecord } from '../../api';
import {
  CancelButtonContainer,
  StepContainer,
} from './diagnostic_screen_components';

interface DiagnosticStep {
  button: string;
  label: string;
  key: MarkScanControllerButton;
}

export const DIAGNOSTIC_STEPS: DiagnosticStep[] = [
  {
    button: 'up',
    label: 'Up',
    key: Keybinding.FOCUS_PREVIOUS,
  },
  {
    button: 'down',
    label: 'Down',
    key: Keybinding.FOCUS_NEXT,
  },
  {
    button: 'left',
    label: 'Left',
    key: Keybinding.PAGE_PREVIOUS,
  },
  {
    button: 'right',
    label: 'Right',
    key: Keybinding.PAGE_NEXT,
  },
  {
    button: 'select',
    label: 'Select',
    key: Keybinding.SELECT,
  },
  {
    button: 'help',
    label: 'Help',
    key: Keybinding.TOGGLE_HELP,
  },
  {
    button: 'volume-down',
    label: 'Volume Down',
    key: Keybinding.VOLUME_DOWN,
  },
  {
    button: 'volume-up',
    label: 'Volume Up',
    key: Keybinding.VOLUME_UP,
  },
  {
    button: 'pause',
    label: 'Pause',
    key: Keybinding.TOGGLE_PAUSE,
  },
  {
    button: 'rate-down',
    label: 'Decrease Rate',
    key: Keybinding.PLAYBACK_RATE_DOWN,
  },
  {
    button: 'rate-up',
    label: 'Increase Rate',
    key: Keybinding.PLAYBACK_RATE_UP,
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
      <MarkScanControllerIllustration highlight={step.key} />

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
        key={curStep.key}
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
