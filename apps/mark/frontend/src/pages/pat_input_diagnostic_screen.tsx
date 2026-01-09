import { PatDeviceCalibrationPage } from '@votingworks/ui';
import { VoterScreen } from '@votingworks/mark-flow-ui';
import { addDiagnosticRecord } from '../api';

interface PatInputDiagnosticScreenProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function PatInputDiagnosticScreen({
  onComplete,
  onCancel,
}: PatInputDiagnosticScreenProps): JSX.Element {
  const addDiagnosticRecordMutation = addDiagnosticRecord.useMutation();

  function passTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-pat-input',
      outcome: 'pass',
    });
    onComplete();
  }

  function failTest() {
    addDiagnosticRecordMutation.mutate({
      type: 'mark-pat-input',
      outcome: 'fail',
      message: 'Test was ended early.',
    });
    onCancel();
  }

  return (
    <PatDeviceCalibrationPage
      isDiagnostic
      onSuccessfulCalibration={passTest}
      onSkipCalibration={failTest}
      ScreenWrapper={VoterScreen}
    />
  );
}
