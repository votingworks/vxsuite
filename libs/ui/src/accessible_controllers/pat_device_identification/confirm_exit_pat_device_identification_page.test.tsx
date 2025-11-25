import { test } from 'vitest';
import { render, screen } from '../../../test/react_testing_library';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';

test('renders success message', () => {
  render(<ConfirmExitPatDeviceIdentificationPage />);

  screen.getByText('Device Inputs Identified');
});

test('renders diagnostic variant', () => {
  render(<ConfirmExitPatDeviceIdentificationPage isDiagnostic />);

  screen.getByText('Test Passed');
  screen.getByText('Personal Assistive Technology Input Test');
});
