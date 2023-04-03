import { Meta } from '@storybook/react';

import {
  UnconfiguredElectionScreen,
  UnconfiguredElectionScreenProps,
} from './unconfigured_election_screen';

const initialProps: UnconfiguredElectionScreenProps = {
  isElectionManagerAuth: true,
  machineName: 'VxScan',
  usbDriveStatus: 'mounted',
};

const meta: Meta<typeof UnconfiguredElectionScreen> = {
  title: 'libs-ui/UnconfiguredElectionScreen',
  component: UnconfiguredElectionScreen,
  args: initialProps,
};

export default meta;

export { UnconfiguredElectionScreen };
