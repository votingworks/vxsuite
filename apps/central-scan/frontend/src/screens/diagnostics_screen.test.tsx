import { afterEach, beforeEach, expect, test } from 'vitest';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen } from '../../test/react_testing_library.js';
import { renderInAppContext } from '../../test/render_in_app_context.js';
import { createApiMock, ApiMock } from '../../test/api.js';
import { DiagnosticsScreen } from './diagnostics_screen.js';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: false,
  });
  apiMock.setDiskSpaceSummary({
    total: 1_000_000_000,
    available: 500_000_000,
    used: 500_000_000,
  });
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
});

afterEach(() => {
  apiMock.assertComplete();
});

test('diagnostics screen', async () => {
  apiMock.setStatus();
  apiMock.setNetworkStatus();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentUpsDiagnostic();
  apiMock.expectGetSystemSettings();

  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText('No election loaded on device');
  screen.getByText('Battery Level: 50%');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
  screen.getByText('Connected');
  screen.getByText('No test scan on record');
  // Networking is disabled by default, so no Network section is shown
  expect(screen.queryByText('Network')).not.toBeInTheDocument();
});

test('shows the network status when networking is enabled', async () => {
  apiMock.setStatus();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentUpsDiagnostic();
  apiMock.expectGetSystemSettings();
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: { status: 'offline' },
  });

  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText('Network');
  screen.getByText('Offline');

  // Status updates arrive on the next poll (1s interval)
  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: { status: 'online-waiting-for-host' },
  });
  await screen.findByText(
    'Online — no VxAdmin detected on the network',
    {},
    { timeout: 3000 }
  );

  apiMock.setNetworkStatus({
    isEnabled: true,
    connection: { status: 'online-host-detected', hostMachineId: '0002' },
  });
  await screen.findByText(
    'Online — VxAdmin (0002) detected on the network',
    {},
    { timeout: 3000 }
  );
});

test('shows most recent diagnostic', async () => {
  apiMock.setStatus();
  apiMock.setNetworkStatus();
  apiMock.expectGetElectionRecord(readElectionTwoPartyPrimaryDefinition());
  apiMock.expectGetMostRecentScannerDiagnostic({
    type: 'blank-sheet-scan',
    outcome: 'pass',
    timestamp: new Date('2021-01-01T00:00:00').getTime(),
  });
  apiMock.expectGetMostRecentUpsDiagnostic({
    type: 'uninterruptible-power-supply',
    outcome: 'pass',
    timestamp: new Date('2021-01-01T01:00:00').getTime(),
  });
  apiMock.expectGetSystemSettings();

  renderInAppContext(<DiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText(/Example Primary Election/);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
  screen.getByText('Connected');
  screen.getByText('Test scan successful, 1/1/2021, 12:00:00 AM');
  screen.getByText('UPS test successful, 1/1/2021, 1:00:00 AM');
  screen.getByText('Mark Threshold: 0.07');
  screen.getByText('Write-in Threshold: 0.025');
});
