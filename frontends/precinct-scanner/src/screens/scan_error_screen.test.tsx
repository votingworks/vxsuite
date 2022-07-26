import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScanErrorScreen } from './scan_error_screen';

test('render correct test ballot error screen when we are in test mode', async () => {
  render(<ScanErrorScreen error="invalid_test_mode" isTestMode />);
  await screen.findByText('Scanning Error');
  await screen.findByText('Live Ballot detected.');
});

test('render correct test ballot error screen when we are in live mode', async () => {
  render(<ScanErrorScreen error="invalid_test_mode" isTestMode={false} />);
  await screen.findByText('Scanning Error');
  await screen.findByText('Test ballot detected.');
});

test('render correct invalid precinct screen', async () => {
  render(<ScanErrorScreen error="invalid_precinct" isTestMode />);
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'Scanned ballot does not match the precinct this scanner is configured for.'
  );
});

test('render correct invalid election hash screen', async () => {
  render(<ScanErrorScreen error="invalid_election_hash" isTestMode={false} />);
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'Scanned ballot does not match the election this scanner is configured for.'
  );
});

test('render correct unreadable ballot screen', async () => {
  render(<ScanErrorScreen error="unreadable" isTestMode />);
  await screen.findByText('Scanning Error');
  await screen.findByText(
    'There was a problem reading this ballot. Please try again.'
  );
});
