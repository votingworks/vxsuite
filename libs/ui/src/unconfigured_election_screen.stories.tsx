import { Meta } from '@storybook/react';

import {
  UnconfiguredElectionScreen,
  UnconfiguredElectionScreenProps,
} from './unconfigured_election_screen.js';
import { mockUsbDriveStatus } from './test-utils/mock_usb_drive.js';

const initialProps: UnconfiguredElectionScreenProps = {
  isElectionManagerAuth: true,
  machineName: 'VxScan',
  usbDriveStatus: mockUsbDriveStatus('mounted'),
};

const meta: Meta<typeof UnconfiguredElectionScreen> = {
  title: 'libs-ui/UnconfiguredElectionScreen',
  component: UnconfiguredElectionScreen,
  args: initialProps,
};

export default meta;

export { UnconfiguredElectionScreen };
