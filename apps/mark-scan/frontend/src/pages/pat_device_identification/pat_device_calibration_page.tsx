import { useCallback, useState } from 'react';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';
import { setPatDeviceIsCalibrated } from '../../api';

export interface PatDeviceCalibrationPageProps {
  onSuccessfulCalibration?: () => void;
  onSkipCalibration?: () => void;
  successScreenButtonLabel?: JSX.Element;
  successScreenDescription?: JSX.Element;
}

export function PatDeviceCalibrationPage({
  onSuccessfulCalibration,
  onSkipCalibration,
  successScreenButtonLabel,
  successScreenDescription,
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
        nextButtonLabel={successScreenButtonLabel}
        description={successScreenDescription}
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
