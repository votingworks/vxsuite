import { BallotPackageConfigurationError } from '@votingworks/types';
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

test.each([
  {
    description: 'no USB drive is detected',
    errorString: 'no_ballot_package_on_usb_drive',
    expectedErrorMessage: 'No ballot package found on the inserted USB drive.',
  },
  {
    description: 'ballot package loading is attempted before authorization',
    errorString: 'auth_required_before_ballot_package_load',
    expectedErrorMessage:
      'Insert an election manager card before loading a ballot package.',
  },
  {
    description: 'authorized card is for a role other than election manager',
    errorString: 'user_role_not_allowed',
    expectedErrorMessage:
      'Insert an election manager card before loading a ballot package.',
  },
  {
    description:
      'election hash on authorized card does not match that on the most recent ballot package',
    errorString: 'election_hash_mismatch',
    expectedErrorMessage:
      'The most recent ballot package found is for a different election.',
  },
])(
  'UnconfiguredElectionScreen shows an error when $description',
  async ({ errorString, expectedErrorMessage }) => {
    render(
      <UnconfiguredElectionScreen
        usbDriveStatus="mounted"
        backendConfigError={errorString as BallotPackageConfigurationError}
      />
    );

    await screen.findByText(expectedErrorMessage);
  }
);
