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
  apiMock.expectGetDiskSpaceSummary({
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
  screen.getByText('Write-in Threshold: 0.05');
});
