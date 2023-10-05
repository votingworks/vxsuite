import { useCallback, useState } from 'react';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';
import { setPatDeviceIsCalibrated } from '../../api';

export function PatDeviceCalibrationPage(): JSX.Element {
  const setPatDeviceIsCalibratedMutation =
    setPatDeviceIsCalibrated.useMutation();
  function onExitCalibration() {
    setPatDeviceIsCalibratedMutation.mutate();
  }
  const [areInputsIdentified, setAreInputsIdentified] = useState(true);

  const onPressBack = useCallback(() => {
    setAreInputsIdentified(false);
  }, [setAreInputsIdentified]);

  const onAllInputsIdentified = useCallback(() => {
    setAreInputsIdentified(true);
  }, [setAreInputsIdentified]);

  if (areInputsIdentified) {
    return (
      <ConfirmExitPatDeviceIdentificationPage
        onPressContinue={onExitCalibration}
        onPressBack={onPressBack}
      />
    );
  }

  return (
    <PatDeviceIdentificationPage
      onAllInputsIdentified={onAllInputsIdentified}
      onExitCalibration={onExitCalibration}
    />
  );
}
