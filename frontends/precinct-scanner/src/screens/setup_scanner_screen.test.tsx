import React from 'react';
import fetchMock from 'fetch-mock';
import { render, screen } from '@testing-library/react';
import { advanceTimersAndPromises } from '@votingworks/test-utils';
import { SetupScannerScreen } from './setup_scanner_screen';

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.reset();
});

test('the unplug/replug flow', async () => {
  const { rerender } = render(
    <SetupScannerScreen batteryIsCharging scannedBallotCount={42} />
  );

  await screen.findByText('Please wait...');

  await advanceTimersAndPromises(3);

  await screen.findByText('Scanner Error');
  await screen.findByText('Ask a poll worker to unplug the power cord.');

  rerender(
    <SetupScannerScreen batteryIsCharging={false} scannedBallotCount={42} />
  );
  await screen.findByText('Scanner Error');
  await screen.findByText('OK, now please plug the power cord back in.');

  // if the scanner isn't connected yet, but the power is back on,
  // keep the same error screen up, don't wobble.
  // expect a retry call.
  fetchMock.post('/precinct-scanner/scanner/retry', {});
  rerender(<SetupScannerScreen batteryIsCharging scannedBallotCount={42} />);

  expect(fetchMock.calls('/precinct-scanner/scanner/retry')).toHaveLength(1);

  await screen.findByText('Scanner Error');
  await screen.findByText('OK, now please plug the power cord back in.');
});

test('power cord is unplugged and replugged shows the right message', async () => {
  const { rerender } = render(
    <SetupScannerScreen batteryIsCharging={false} scannedBallotCount={42} />
  );

  await screen.findByText('No Power Detected');

  rerender(<SetupScannerScreen batteryIsCharging scannedBallotCount={42} />);

  await advanceTimersAndPromises(1);

  // should not wobble
  await screen.findByText('No Power Detected');
});
