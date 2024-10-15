import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { PatDeviceIdentificationPage } from './pat_device_identification_page';

test('advances to next step', () => {
  const onAllInputsIdentified = jest.fn();
  const onExitCalibration = jest.fn();

  render(
    <PatDeviceIdentificationPage
      onAllInputsIdentified={onAllInputsIdentified}
      onExitCalibration={onExitCalibration}
    />
  );

  screen.getByText('Personal Assistive Technology Device Setup');
  screen.getByText('Activate either input to continue.');
  userEvent.keyboard('1');
  screen.getByRole('heading', { name: 'Choose Input: "Move"' });
});
