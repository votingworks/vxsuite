import { Main, Screen, P, Font, Button } from '@votingworks/ui';
import { useCallback, useState, useEffect } from 'react';
import { ButtonFooter } from '@votingworks/mark-flow-ui';
import {
  DiagnosticScreenHeader,
  StepContainer,
} from '../diagnostic_screen_components';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';
import { handleKeyboardEvent } from '../../lib/assistive_technology';

export interface Props {
  onAllInputsIdentified: () => void;
  onExitCalibration: () => void;
}

export function PatDeviceIdentificationPage({
  onAllInputsIdentified,
  onExitCalibration,
}: Props): JSX.Element {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // During PAT identification the voter triggers PAT inputs to identify them. We don't
    // want PAT input to actually navigate focus or select elements as random navigate +
    // select events could accidentally exit PAT calibration early.
    document.removeEventListener('keydown', handleKeyboardEvent);

    // On cleanup, re-enable the listener once devices are identified and the user is prompted
    // to select the "Continue with Voting" button
    return () => {
      document.addEventListener('keydown', handleKeyboardEvent);
    };
  }, []);

  const nextStep = useCallback(() => {
    setStep(step + 1);
  }, [step, setStep]);

  const steps = [
    <PatIntroductionStep onStepCompleted={nextStep} key={0} />,
    <IdentifyInputStep inputName="Move" onStepCompleted={nextStep} key={1} />,
    <IdentifyInputStep
      inputName="Select"
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
        </DiagnosticScreenHeader>
        <StepContainer fullWidth>{steps[step]}</StepContainer>
      </Main>
      <ButtonFooter>
        <Button onPress={onExitCalibration}>Skip Identification</Button>
      </ButtonFooter>
    </Screen>
  );
}
