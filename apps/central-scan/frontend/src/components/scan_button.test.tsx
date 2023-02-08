import React from 'react';
import { render, screen } from '@testing-library/react';
import { fakeKiosk } from '@votingworks/test-utils';
import { ScanButton } from './scan_button';

test('is enabled by default when scanner attached', async () => {
  render(<ScanButton onPress={jest.fn()} isScannerAttached />);
  const button = await screen.findByText<HTMLButtonElement>('Scan New Batch');
  expect(button.disabled).toBeFalsy();
});

test('is disabled when scanner not attached', async () => {
  window.kiosk = fakeKiosk();
  render(<ScanButton onPress={jest.fn()} isScannerAttached={false} />);
  const button = await screen.findByText<HTMLButtonElement>('No Scanner');
  expect(button.disabled).toBeTruthy();
});

test('is disabled when disabled set to true', async () => {
  window.kiosk = fakeKiosk();
  render(<ScanButton onPress={jest.fn()} disabled isScannerAttached />);
  const button = await screen.findByText<HTMLButtonElement>('Scan New Batch');
  expect(button.disabled).toBeTruthy();
});

test('calls onPress when clicked', async () => {
  const onPress = jest.fn();
  render(<ScanButton onPress={onPress} isScannerAttached />);
  (await screen.findByText<HTMLButtonElement>('Scan New Batch')).click();
  expect(onPress).toHaveBeenCalledTimes(1);
});
