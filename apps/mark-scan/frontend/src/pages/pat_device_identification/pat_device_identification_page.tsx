import { Main, Screen, P, Font, Button } from '@votingworks/ui';
import { useCallback, useEffect, useState } from 'react';
import {
  DiagnosticScreenHeader,
  StepContainer,
} from '../diagnostic_screen_components';
import { handleGamepadKeyboardEvent } from '../../lib/gamepad';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';

interface Props {
  onAllInputsIdentified: () => void;
  onExitCalibration: () => void;
}

export function PatDeviceIdentificationPage({
  onAllInputsIdentified,
  onExitCalibration,
}: Props): JSX.Element {
  const [step, setStep] = useState(0);

  const nextStep = useCallback(() => {
    setStep(step + 1);
  }, [step, setStep]);

  useEffect(() => {
    // Child components override the gamepad keyboard listener while we take
    // the voter through device identification.
    document.removeEventListener('keydown', handleGamepadKeyboardEvent);

    // Reattach the gamepad listener on cleanup
    return () => {
      document.addEventListener('keydown', handleGamepadKeyboardEvent);
    };
  });

  const steps = [
    <PatIntroductionStep onStepCompleted={nextStep} key={0} />,
    <IdentifyInputStep
      inputName="Navigate"
      onStepCompleted={nextStep}
      key={1}
    />,
    <IdentifyInputStep
      inputName="Activate"
      onStepCompleted={onAllInputsIdentified}
      key={2}
    />,
  ];

  return (
    <Screen>
      <Main centerChild>
        <DiagnosticScreenHeader>
          <P>
            <Font weight="bold">PAT Device Identification</Font> &mdash; Step{' '}
            {step + 1} of {steps.length}
          </P>
          <Button onPress={onExitCalibration}>Skip Identification</Button>
        </DiagnosticScreenHeader>
        <StepContainer>{steps[step]}</StepContainer>
      </Main>
    </Screen>
  );
}
