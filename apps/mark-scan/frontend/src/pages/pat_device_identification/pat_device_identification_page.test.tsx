import { test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';

test('advances to next step', () => {
  const onAllInputsIdentified = vi.fn();
  const onExitCalibration = vi.fn();

  render(
    <PatDeviceIdentificationPage
      onAllInputsIdentified={onAllInputsIdentified}
      onExitCalibration={onExitCalibration}
    />
  );

  screen.getByText('Personal Assistive Technology Device Identification');
  screen.getByText('Activate either input to continue.');
  userEvent.keyboard('1');
  screen.getByRole('heading', { name: 'Identify the "Move" Input' });
});
