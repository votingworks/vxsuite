import { fakeKiosk } from '@votingworks/test-utils';
import userEvent from '@testing-library/user-event';
import { render, screen } from '../../test/react_testing_library';
import { ScanButton } from './scan_button';

test('is enabled by default when scanner attached', async () => {
  render(<ScanButton onPress={jest.fn()} isScannerAttached />);
  const button = await screen.findButton('Scan New Batch');
  expect(button).toBeEnabled();
});

test('is disabled when scanner not attached', async () => {
  window.kiosk = fakeKiosk();
  render(<ScanButton onPress={jest.fn()} isScannerAttached={false} />);
  const button = await screen.findButton('No Scanner');
  expect(button).toBeDisabled();
});

test('is disabled when disabled set to true', async () => {
  window.kiosk = fakeKiosk();
  render(<ScanButton onPress={jest.fn()} disabled isScannerAttached />);
  const button = await screen.findButton('Scan New Batch');
  expect(button).toBeDisabled();
});

test('calls onPress when clicked', async () => {
  const onPress = jest.fn();
  render(<ScanButton onPress={onPress} isScannerAttached />);
  userEvent.click(await screen.findButton('Scan New Batch'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
