import { VoterScreen } from '@votingworks/mark-flow-ui';
import { PatDeviceCalibrationPage } from '@votingworks/ui';
import { setPatDeviceIsCalibrated } from '../api';

export interface PatDeviceCalibrationPageWrapperProps {
  isDiagnostic?: boolean;
  onSuccessfulCalibration?: () => void;
  onSkipCalibration?: () => void;
}

/**
 * Wrapper around the shared PatDeviceCalibrationPage that provides:
 * - VoterScreen as the layout wrapper
 * - The setPatDeviceIsCalibrated API mutation
 */
export function PatDeviceCalibrationPageWrapper({
  isDiagnostic,
  onSuccessfulCalibration,
  onSkipCalibration,
}: PatDeviceCalibrationPageWrapperProps): JSX.Element {
  const setPatDeviceIsCalibratedMutation =
    setPatDeviceIsCalibrated.useMutation();

  return (
    <PatDeviceCalibrationPage
      isDiagnostic={isDiagnostic}
      onSuccessfulCalibration={() => {
        onSuccessfulCalibration?.();
        setPatDeviceIsCalibratedMutation.mutate();
      }}
      onSkipCalibration={() => {
        onSkipCalibration?.();
        setPatDeviceIsCalibratedMutation.mutate();
      }}
      ScreenWrapper={VoterScreen}
    />
  );
}
