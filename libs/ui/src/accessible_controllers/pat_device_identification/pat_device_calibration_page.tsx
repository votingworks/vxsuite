import { useCallback, useState } from 'react';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';

export type PatCalibrationStep = 'identifying' | 'complete';

export interface UsePatCalibrationResult {
  /** Current step in the calibration flow */
  step: PatCalibrationStep;
  /** Call when all inputs have been identified (moves to complete step) */
  onAllInputsIdentified: () => void;
  /** Call to go back from complete step to identification step */
  onGoBack: () => void;
}

/**
 * Hook to manage PAT device calibration flow state.
 * Use this when you need control over the calibration UI layout.
 */
export function usePatCalibration(): UsePatCalibrationResult {
  const [step, setStep] = useState<PatCalibrationStep>('identifying');

  const onAllInputsIdentified = useCallback(() => {
    setStep('complete');
  }, []);

  const onGoBack = useCallback(() => {
    setStep('identifying');
  }, []);

  return {
    step,
    onAllInputsIdentified,
    onGoBack,
  };
}

export interface PatDeviceCalibrationContentProps {
  isDiagnostic?: boolean;
  /** Current step in the calibration flow */
  step: PatCalibrationStep;
  /** Callback when all inputs have been identified */
  onAllInputsIdentified: () => void;
}

/**
 * Content for the PAT device calibration flow. Renders either the identification
 * steps or the confirmation screen based on the provided step.
 *
 * The consuming app is responsible for:
 * 1. Managing state via usePatCalibration hook
 * 2. Wrapping this in an appropriate screen layout
 * 3. Providing navigation buttons (skip, back, continue, etc.)
 */
export function PatDeviceCalibrationContent({
  isDiagnostic,
  step,
  onAllInputsIdentified,
}: PatDeviceCalibrationContentProps): JSX.Element {
  if (step === 'complete') {
    return (
      <ConfirmExitPatDeviceIdentificationPage isDiagnostic={isDiagnostic} />
    );
  }

  return (
    <PatDeviceIdentificationPage
      isDiagnostic={isDiagnostic}
      onAllInputsIdentified={onAllInputsIdentified}
    />
  );
}

// Re-export for backward compatibility - apps should migrate to the new API
export {
  PatDeviceIdentificationPage,
  type PatDeviceIdentificationPageProps,
} from './pat_device_identification_page';
export {
  ConfirmExitPatDeviceIdentificationPage,
  type ConfirmExitPatDeviceIdentificationPageProps,
} from './confirm_exit_pat_device_identification_page';
