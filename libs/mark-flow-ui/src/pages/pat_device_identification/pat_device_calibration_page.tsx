import { useCallback, useState } from 'react';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';
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

  const [areInputsIdentified, setAreInputsIdentified] = useState(false);

  const onPressBack = useCallback(() => {
    setAreInputsIdentified(false);
  }, [setAreInputsIdentified]);

  const onAllInputsIdentified = useCallback(() => {
    setAreInputsIdentified(true);
  }, [setAreInputsIdentified]);

  if (areInputsIdentified) {
    return (
      <ConfirmExitPatDeviceIdentificationPage
        isDiagnostic={isDiagnostic}
        onPressContinue={() => {
          if (onSuccessfulCalibration) {
            onSuccessfulCalibration();
          }

          setPatDeviceIsCalibratedMutation.mutate();
        }}
        onPressBack={onPressBack}
      />
    );
  }

  return (
    <PatDeviceIdentificationPage
      isDiagnostic={isDiagnostic}
      onAllInputsIdentified={onAllInputsIdentified}
      onExitCalibration={() => {
        if (onSkipCalibration) {
          onSkipCalibration();
        }

        setPatDeviceIsCalibratedMutation.mutate();
      }}
    />
  );
}
