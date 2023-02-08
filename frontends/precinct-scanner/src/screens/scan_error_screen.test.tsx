import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScanErrorScreen } from './scan_error_screen';

test('render correct test ballot error screen when we are in test mode', async () => {
  render(
    <ScanErrorScreen
      error="invalid_test_mode"
      isTestMode
      scannedBallotCount={42}
    />
  );
  await screen.findByText('Ballot Not Counted');
  await screen.findByText('Live ballot detected. Scanner is in test mode.');
});

test('render correct test ballot error screen when we are in live mode', async () => {
  render(
    <ScanErrorScreen
      error="invalid_test_mode"
      isTestMode={false}
      scannedBallotCount={42}
    />
  );
  await screen.findByText('Ballot Not Counted');
  await screen.findByText('Test ballot detected. Scanner is in live mode.');
});

test('render correct invalid precinct screen', async () => {
  render(
    <ScanErrorScreen
      error="invalid_precinct"
      isTestMode
      scannedBallotCount={42}
    />
  );
  await screen.findByText('Ballot Not Counted');
  await screen.findByText(
    'The ballot does not match the precinct this scanner is configured for.'
  );
});

test('render correct invalid election hash screen', async () => {
  render(
    <ScanErrorScreen
      error="invalid_election_hash"
      isTestMode={false}
      scannedBallotCount={42}
    />
  );
  await screen.findByText('Ballot Not Counted');
  await screen.findByText(
    'The ballot does not match the election this scanner is configured for.'
  );
});

test('render correct unreadable ballot screen', async () => {
  render(
    <ScanErrorScreen error="unreadable" isTestMode scannedBallotCount={42} />
  );
  await screen.findByText('Ballot Not Counted');
  await screen.findByText(
    'There was a problem reading this ballot. Please scan again.'
  );
});

test('render correct through unrecoverable error', async () => {
  render(
    <ScanErrorScreen
      error="plustek_error"
      scannedBallotCount={42}
      restartRequired
      powerConnected
      isTestMode
    />
  );
  await screen.findByText('Scanner Error');
  await screen.findByText('Ask a poll worker to unplug the power cord.');
});

test('render correct through unrecoverable error with power cord unplugged', async () => {
  render(
    <ScanErrorScreen
      error="plustek_error"
      scannedBallotCount={42}
      restartRequired
      powerConnected={false}
      isTestMode
    />
  );

  await screen.findByText('Scanner Error');
  await screen.findByText(
    'Plug the power cord back in to restart the scanner.'
  );
});
