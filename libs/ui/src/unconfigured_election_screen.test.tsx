import { ElectionPackageConfigurationError } from '@votingworks/types';
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

test.each([
  {
    description: 'no election package on USB drive',
    errorString: 'no_election_package_on_usb_drive',
    expectedErrorMessage:
      'No election package found on the inserted USB drive.',
  },
  {
    description: 'election package loading is attempted before authorization',
    errorString: 'auth_required_before_election_package_load',
    expectedErrorMessage: 'Insert an election manager card before configuring.',
  },
  {
    description: 'election package authentication errs',
    errorString: 'election_package_authentication_error',
    expectedErrorMessage:
      'Error authenticating election package. Try exporting it from VxAdmin again.',
  },
  {
    description:
      'election on authorized card does not match that on the most recent election package',
    errorString: 'election_key_mismatch',
    expectedErrorMessage:
      'The most recent election package found is for a different election.',
  },
])(
  'UnconfiguredElectionScreen shows an error when $description',
  async ({ errorString, expectedErrorMessage }) => {
    render(
      <UnconfiguredElectionScreen
        usbDriveStatus={mockUsbDriveStatus('mounted')}
        backendConfigError={errorString as ElectionPackageConfigurationError}
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
