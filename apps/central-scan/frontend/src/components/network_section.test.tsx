import { expect, test } from 'vitest';
import type { NetworkConnectionInfo } from '@votingworks/central-scan-backend';
import { render, screen } from '../../test/react_testing_library.js';
import { NetworkSection } from './network_section.js';

const testCases: Array<{
  connection: NetworkConnectionInfo;
  expectedText: string;
}> = [
  {
    connection: { status: 'offline' },
    expectedText: 'Offline',
  },
  {
    connection: { status: 'online-waiting-for-host' },
    expectedText: 'Online — no VxAdmin detected on the network',
  },
  {
    connection: { status: 'online-multiple-hosts-detected' },
    expectedText:
      'Multiple VxAdmins detected on the network. Ensure only one VxAdmin is connected.',
  },
  {
    connection: {
      status: 'online-code-version-mismatch',
      hostMachineId: '0002',
    },
    expectedText: 'VxAdmin (0002) is running a different software version',
  },
  {
    connection: {
      status: 'online-machine-unconfigured',
      hostMachineId: '0002',
    },
    expectedText:
      'VxAdmin (0002) detected on the network. Configure this machine with an election to connect.',
  },
  {
    connection: { status: 'online-host-unconfigured', hostMachineId: '0002' },
    expectedText:
      'VxAdmin (0002) detected on the network, but it is not configured with an election.',
  },
  {
    connection: {
      status: 'online-ballot-hash-mismatch',
      hostMachineId: '0002',
    },
    expectedText: 'VxAdmin (0002) is configured for a different election',
  },
  {
    connection: { status: 'online-host-detected', hostMachineId: '0002' },
    expectedText: 'Online — VxAdmin (0002) detected on the network',
  },
];

test.each(testCases)(
  'renders $connection.status',
  ({ connection, expectedText }) => {
    const { unmount } = render(<NetworkSection connection={connection} />);
    screen.getByText('Network');
    expect(
      screen.getByText(
        (_, element) => element?.textContent?.trim() === expectedText
      )
    ).toBeInTheDocument();
    unmount();
  }
);
