import { afterEach, beforeEach, test } from 'vitest';
import { mockUsbDriveStatus } from '@votingworks/ui';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { createApiMock, ApiMock } from '../../test/api';
import { DiagnosticsScreen } from './diagnostics_screen';

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

  // Network section defaults
  screen.getByRole('heading', { name: 'Network' });
  screen.getByText('Offline');
  screen.getByText('All saved batches have been sent to VxAdmin');
});

function expectNetworkSectionQueries() {
  apiMock.setStatus();
  apiMock.expectGetElectionRecord(null);
  apiMock.expectGetMostRecentScannerDiagnostic();
  apiMock.expectGetMostRecentUpsDiagnostic();
  apiMock.expectGetSystemSettings();
}

test('network section when connected to a VxAdmin with unsent batches and a send error', async () => {
  expectNetworkSectionQueries();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  apiMock.setCvrSyncStatus({
    state: 'idle',
    unsentBatchCount: 2,
    lastError: 'Host refused the transfer',
  });

  renderInAppContext(<DiagnosticsScreen />, { apiMock });

  await screen.findByText('Online — connected to VxAdmin (ADMIN-01)');
  screen.getByText('2 batches waiting to be sent to VxAdmin');
  screen.getByText('Last send attempt failed: Host refused the transfer');
});

test('network section when the VxAdmin is configured for a different election', async () => {
  expectNetworkSectionQueries();
  apiMock.setHostConnectionInfo({ status: 'election-mismatch' });
  apiMock.setCvrSyncStatus({ state: 'idle', unsentBatchCount: 1 });

  renderInAppContext(<DiagnosticsScreen />, { apiMock });

  await screen.findByText(
    'The VxAdmin on the network is configured for a different election'
  );
  screen.getByText('1 batch waiting to be sent to VxAdmin');
});

test('network section when multiple VxAdmins are detected', async () => {
  expectNetworkSectionQueries();
  apiMock.setHostConnectionInfo({ status: 'multiple-hosts-detected' });
  apiMock.setCvrSyncStatus({ state: 'syncing', unsentBatchCount: 1 });

  renderInAppContext(<DiagnosticsScreen />, { apiMock });

  await screen.findByText('Multiple VxAdmins detected on the network');
  screen.getByText('Sending CVRs to VxAdmin…');
});

test('network section when online but no VxAdmin is detected', async () => {
  expectNetworkSectionQueries();
  apiMock.setHostConnectionInfo({ status: 'waiting-for-host' });

  renderInAppContext(<DiagnosticsScreen />, { apiMock });

  await screen.findByText('Online — no VxAdmin detected on the network');
});

test('network section shows progress for the batch currently being sent', async () => {
  expectNetworkSectionQueries();
  apiMock.setHostConnectionInfo({
    status: 'connected-to-host',
    hostMachineId: 'ADMIN-01',
  });
  apiMock.setCvrSyncStatus({
    state: 'syncing',
    unsentBatchCount: 1,
    currentBatch: {
      batchId: 'batch-1',
      label: 'Batch 3',
      sheetsSent: 2,
      sheetsTotal: 17,
    },
  });

  renderInAppContext(<DiagnosticsScreen />, { apiMock });

  await screen.findByText('Sending Batch 3 to VxAdmin (2 of 17 sheets)…');
});

test('shows most recent diagnostic', async () => {
  apiMock.setStatus();
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
