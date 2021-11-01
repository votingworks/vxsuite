import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanErrorScreen } from './ScanErrorScreen';
import { RejectedScanningReason } from '../config/types';

test('render correct test ballot error screen when we are in test mode', async () => {
  const dismiss = jest.fn();
  render(
    <ScanErrorScreen
      dismissError={dismiss}
      rejectionReason={RejectedScanningReason.InvalidTestMode}
      isTestMode
    />
  );
  await screen.findByText('Scanning Error');
  await screen.findByText('Live Ballot detected.');
  fireEvent.click(await screen.findByText('Dismiss Error'));
  expect(dismiss).toHaveBeenCalled();
});

test('render correct test ballot error screen when we are in live mode', async () => {
  render(
    <ScanErrorScreen
      rejectionReason={RejectedScanningReason.InvalidTestMode}
      isTestMode={false}
    />
  );
  await screen.findByText('Scanning Error');
  await screen.findByText('Test ballot detected.');
  expect(screen.queryByText('Dismiss Error')).toBeNull();
});

test('render correct invalid precinct screen', async () => {
  render(
    <ScanErrorScreen
      rejectionReason={RejectedScanningReason.InvalidPrecinct}
      isTestMode
    />
  );
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'Scanned ballot does not match the precinct this scanner is configured for.'
  );
  expect(screen.queryByText('Dismiss Error')).toBeNull();
});

test('render correct test ballot error screen when we are in test mode', async () => {
  const dismiss = jest.fn();
  render(
    <ScanErrorScreen
      dismissError={dismiss}
      rejectionReason={RejectedScanningReason.InvalidElectionHash}
      isTestMode={false}
    />
  );
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'Scanned ballot does not match the election this scanner is configured for.'
  );
  fireEvent.click(await screen.findByText('Dismiss Error'));
  expect(dismiss).toHaveBeenCalled();
});

test('render correct test ballot error screen when we are in test mode', async () => {
  const dismiss = jest.fn();
  render(
    <ScanErrorScreen
      dismissError={dismiss}
      rejectionReason={RejectedScanningReason.Unreadable}
      isTestMode
    />
  );
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'There was a problem reading this ballot. Please try again.'
  );
  fireEvent.click(await screen.findByText('Dismiss Error'));
  expect(dismiss).toHaveBeenCalled();
});
