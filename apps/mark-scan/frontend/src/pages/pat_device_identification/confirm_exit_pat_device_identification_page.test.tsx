import userEvent from '@testing-library/user-event';
import { render, screen } from '../../../test/react_testing_library';
import { ConfirmExitPatDeviceIdentificationPage } from './confirm_exit_pat_device_identification_page';

test('calls provided Back and Continue functions', () => {
  const backFn = jest.fn();
  const continueFn = jest.fn();

  render(
    <ConfirmExitPatDeviceIdentificationPage
      onPressBack={backFn}
      onPressContinue={continueFn}
    />
  );

  screen.getByText('Device Inputs Chosen');
  expect(backFn).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Back'));
  expect(backFn).toHaveBeenCalled();

  expect(continueFn).not.toHaveBeenCalled();
  userEvent.click(screen.getByText('Continue'));
  expect(continueFn).toHaveBeenCalled();
});
