import { test } from 'vitest';
import {
  ElectionPackageConfigurationError,
  SYSTEM_LIMITS,
} from '@votingworks/types';
import { render, screen } from '../test/react_testing_library';

import { UnconfiguredElectionScreen } from './unconfigured_election_screen';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive';

test('UnconfiguredElectionScreen shows an error message when no USB drive is inserted', async () => {
  render(
    <UnconfiguredElectionScreen
      usbDriveStatus={mockUsbDriveStatus('no_drive')}
      machineName="VxScan"
      isElectionManagerAuth
    />
  );

  await screen.findByText('Insert a USB drive containing an election package');
});

test('UnconfiguredElectionScreen shows a loading screen when USB drive is mounted and no error message exists', async () => {
  render(
    <UnconfiguredElectionScreen
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      isElectionManagerAuth
      machineName="VxScan"
    />
  );

  await screen.findByText('Configuring VxScan from USB drive…');
});

test.each<{
  description: string;
  error: ElectionPackageConfigurationError;
  expectedErrorMessage: string;
}>([
  {
    description: 'no election package on USB drive',
    error: { type: 'no_election_package_on_usb_drive' },
    expectedErrorMessage:
      'No signed election package found on the inserted USB drive. Save a signed election package in VxAdmin.',
  },
  {
    description: 'election package loading is attempted before authorization',
    error: { type: 'auth_required_before_election_package_load' },
    expectedErrorMessage: 'Insert an election manager card before configuring.',
  },
  {
    description: 'election package authentication errs',
    error: { type: 'election_package_authentication_error' },
    expectedErrorMessage:
      'Error authenticating election package. Try exporting it from VxAdmin again.',
  },
  {
    description:
      'election on authorized card does not match that on the most recent election package',
    error: { type: 'election_key_mismatch' },
    expectedErrorMessage:
      'The most recent election package found is for a different election.',
  },
  {
    description: 'system limit exceeded',
    error: {
      type: 'system_limit_violation',
      violation: {
        limitScope: 'markScanBallotStyle',
        limitType: 'candidatesSummedAcrossContests',
        valueExceedingLimit:
          SYSTEM_LIMITS.markScanBallotStyle.candidatesSummedAcrossContests + 1,
        ballotStyleId: 'ballot-style-1',
      },
    },
    expectedErrorMessage:
      'Number of candidates summed across contests in ballot style ballot-style-1 (136) exceeds VxMarkScan system limit of 135.',
  },
])(
  'UnconfiguredElectionScreen shows an error when $description',
  async ({ error, expectedErrorMessage }) => {
    render(
      <UnconfiguredElectionScreen
        usbDriveStatus={mockUsbDriveStatus('mounted')}
        backendConfigError={error}
        isElectionManagerAuth
        machineName="VxScan"
      />
    );

    await screen.findByText('Failed to configure VxScan');
    screen.getByText(expectedErrorMessage);
  }
);

test('UnconfiguredElectionScreen shows an error when not authed as election manager', async () => {
  render(
    <UnconfiguredElectionScreen
      usbDriveStatus={mockUsbDriveStatus('mounted')}
      isElectionManagerAuth={false}
      machineName="VxScan"
    />
  );

  await screen.findByText('Only election managers can configure VxScan.');
});
