import { Main, Screen, P, Font, Button } from '@votingworks/ui';
import { useCallback, useState } from 'react';
import {
  DiagnosticScreenHeader,
  StepContainer,
} from '../diagnostic_screen_components';
import { PatIntroductionStep } from './pat_introduction_step';
import { IdentifyInputStep } from './identify_input_step';
import { ButtonFooter } from '../../components/button_footer';

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
