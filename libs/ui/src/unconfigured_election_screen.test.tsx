import React from 'react';
import { render, screen } from '../test/react_testing_library';

import { UnconfiguredElectionScreen } from './unconfigured_election_screen';

test('UnconfiguredElectionScreen shows an error message when no USB drive is inserted', async () => {
  render(<UnconfiguredElectionScreen usbDriveStatus="absent" />);

  await screen.findByText('VxScan is not configured');
  await screen.findByText('Insert a USB drive containing a ballot package.');
});

test('UnconfiguredElectionScreen shows a loading screen when USB drive is mounted and no error message exists', async () => {
  render(<UnconfiguredElectionScreen usbDriveStatus="mounted" />);

  await screen.findByText('Configuring VxScan from USB drive…');
});

test('UnconfiguredElectionScreen shows a backend config error message', async () => {
  render(
    <UnconfiguredElectionScreen
      usbDriveStatus="mounted"
      backendConfigError="no_ballot_package_on_usb_drive"
    />
  );

  await screen.findByText('No ballot package found on the inserted USB drive.');
});
