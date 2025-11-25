import { expect, test } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Keybinding } from '../../keybindings';
import { render, screen } from '../../../test/react_testing_library';
import {
  PatDeviceCalibrationContent,
  usePatCalibration,
} from './pat_device_calibration_page';

function identifyInputs(): void {
  // Continue past instructions
  userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify first input
  userEvent.keyboard(Keybinding.PAT_MOVE);
  userEvent.keyboard(Keybinding.PAT_MOVE);

  // Identify second input
  userEvent.keyboard(Keybinding.PAT_SELECT);
  userEvent.keyboard(Keybinding.PAT_SELECT);

  screen.getByText('Device Inputs Identified');
}

// Test component that uses the hook
function TestCalibrationFlow(): JSX.Element {
  const { step, onAllInputsIdentified, onGoBack } = usePatCalibration();

  return (
    <div>
      <PatDeviceCalibrationContent
        step={step}
        onAllInputsIdentified={onAllInputsIdentified}
      />
      {step === 'complete' && (
        <button type="button" onClick={onGoBack}>
          Back
        </button>
      )}
    </div>
  );
}

test('shows identification flow content', () => {
  render(
    <PatDeviceCalibrationContent
      step="identifying"
      onAllInputsIdentified={() => {}}
    />
  );

  screen.getByText('Personal Assistive Technology Device Identification');
});

test('shows completion content when step is complete', () => {
  render(
    <PatDeviceCalibrationContent
      step="complete"
      onAllInputsIdentified={() => {}}
    />
  );

  screen.getByText('Device Inputs Identified');
});

test('usePatCalibration hook manages state transitions', () => {
  render(<TestCalibrationFlow />);

  // Initially shows identification flow
  screen.getByText('Personal Assistive Technology Device Identification');

  // Complete the identification flow
  identifyInputs();

  // Now shows completion screen
  screen.getByText('Device Inputs Identified');

  // Can go back
  userEvent.click(screen.getByRole('button', { name: 'Back' }));
  screen.getByText('Test Your Device');
});
