import React from 'react';
import {
  usePatCalibration,
  PatDeviceCalibrationContent,
  Button,
  appStrings,
  Icons,
} from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import { setPatDeviceIsCalibrated } from '../../api';

export interface PatDeviceCalibrationPageProps {
  isDiagnostic?: boolean;
  onSuccessfulCalibration?: () => void;
  onSkipCalibration?: () => void;
}

export function PatDeviceCalibrationPage({
  isDiagnostic,
  onSuccessfulCalibration,
  onSkipCalibration,
}: PatDeviceCalibrationPageProps): JSX.Element {
  const setPatDeviceIsCalibratedMutation =
    setPatDeviceIsCalibrated.useMutation();
  const { step, onAllInputsIdentified, onGoBack } = usePatCalibration();

  function handleComplete() {
    if (onSuccessfulCalibration) {
      onSuccessfulCalibration();
    }
    setPatDeviceIsCalibratedMutation.mutate();
  }

  function handleSkip() {
    if (onSkipCalibration) {
      onSkipCalibration();
    }
    setPatDeviceIsCalibratedMutation.mutate();
  }

  const actionButtons =
    step === 'complete' ? (
      isDiagnostic ? (
        <Button variant="primary" onPress={handleComplete}>
          Exit
        </Button>
      ) : (
        <React.Fragment>
          <Button icon="Previous" onPress={onGoBack}>
            {appStrings.buttonBack()}
          </Button>
          <Button variant="primary" rightIcon="Next" onPress={handleComplete}>
            {appStrings.buttonContinue()}
          </Button>
        </React.Fragment>
      )
    ) : (
      <Button onPress={handleSkip}>
        {isDiagnostic ? (
          <span>
            <Icons.Delete /> Cancel Test
          </span>
        ) : (
          appStrings.buttonBmdSkipPatCalibration()
        )}
      </Button>
    );

  return (
    <VoterScreen
      centerContent
      hideMenuButtons={isDiagnostic}
      actionButtons={actionButtons}
    >
      <PatDeviceCalibrationContent
        isDiagnostic={isDiagnostic}
        step={step}
        onAllInputsIdentified={onAllInputsIdentified}
      />
    </VoterScreen>
  );
}
