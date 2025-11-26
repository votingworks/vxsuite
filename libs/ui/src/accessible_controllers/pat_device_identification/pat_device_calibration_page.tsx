import React, { useCallback, useState } from 'react';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';

export interface PatDeviceCalibrationPageProps {
  isDiagnostic?: boolean;
  onSuccessfulCalibration: () => void;
  onSkipCalibration: () => void;
  /**
   * Wrapper component to render the screen layout. Should accept children,
   * centerContent, hideMenuButtons, and actionButtons props.
   * In VxMarkScan, this is typically VoterScreen from @votingworks/mark-flow-ui.
   */
  ScreenWrapper: React.ComponentType<{
    children: React.ReactNode;
    centerContent?: boolean;
    hideMenuButtons?: boolean;
    actionButtons?: React.ReactNode;
  }>;
}

export function PatDeviceCalibrationPage({
  isDiagnostic,
  onSuccessfulCalibration,
  onSkipCalibration,
  ScreenWrapper,
}: PatDeviceCalibrationPageProps): JSX.Element {
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
        onPressContinue={onSuccessfulCalibration}
        onPressBack={onPressBack}
        ScreenWrapper={ScreenWrapper}
      />
    );
  }

  return (
    <PatDeviceIdentificationPage
      isDiagnostic={isDiagnostic}
      onAllInputsIdentified={onAllInputsIdentified}
      onExitCalibration={onSkipCalibration}
      ScreenWrapper={ScreenWrapper}
    />
  );
}
