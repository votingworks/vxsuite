import { expect, test } from 'vitest';
import type { NetworkConnectionInfo } from '@votingworks/central-scan-backend';
import { render, screen } from '../../test/react_testing_library.js';
import { NetworkSection } from './network_section.js';

const testCases: Array<{
  connection: NetworkConnectionInfo;
  expectedText: string;
  expectedIcon: string;
}> = [
  {
    connection: { status: 'offline' },
    expectedText: 'Offline',
    expectedIcon: 'triangle-exclamation',
  },
  {
    connection: { status: 'online-waiting-for-host' },
    expectedText: 'Online — no VxAdmin detected on the network',
    expectedIcon: 'triangle-exclamation',
  },
  {
    connection: { status: 'online-multiple-hosts-detected' },
    expectedText:
      'Multiple VxAdmins detected on the network. Ensure only one VxAdmin is connected.',
    expectedIcon: 'circle-exclamation',
  },
  {
    connection: {
      status: 'online-code-version-mismatch',
      hostMachineId: '0002',
    },
    expectedText: 'VxAdmin (0002) is running a different software version',
    expectedIcon: 'circle-exclamation',
  },
  {
    connection: {
      status: 'online-machine-unconfigured',
      hostMachineId: '0002',
    },
    expectedText:
      'VxAdmin (0002) detected on the network. Configure this machine with an election to connect.',
    expectedIcon: 'triangle-exclamation',
  },
  {
    connection: { status: 'online-host-unconfigured', hostMachineId: '0002' },
    expectedText:
      'VxAdmin (0002) detected on the network, but it is not configured with an election.',
    expectedIcon: 'triangle-exclamation',
  },
  {
    connection: {
      status: 'online-ballot-hash-mismatch',
      hostMachineId: '0002',
    },
    expectedText: 'VxAdmin (0002) is configured for a different election',
    expectedIcon: 'triangle-exclamation',
  },
  {
    connection: { status: 'online-host-detected', hostMachineId: '0002' },
    expectedText: 'Online — VxAdmin (0002) detected on the network',
    expectedIcon: 'square-check',
  },
];

test.each(testCases)(
  'renders $connection.status',
  ({ connection, expectedText, expectedIcon }) => {
    const { unmount } = render(<NetworkSection connection={connection} />);
    screen.getByText('Network');
    const message = screen.getByText(
      (_, element) => element?.textContent?.trim() === expectedText
    );
    expect(message).toBeInTheDocument();
    // The icon severity matches the top-bar network status indicator's
    // bucket for this status
    expect(
      message.querySelector(`[data-icon='${expectedIcon}']`)
    ).toBeInTheDocument();
    unmount();
  }
);
