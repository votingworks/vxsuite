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
  await screen.findByText(
    'The scanner is in test mode and a live ballot was detected.'
  );
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
  await screen.findByText(
    'The scanner is in live mode and a test ballot was detected.'
  );
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
