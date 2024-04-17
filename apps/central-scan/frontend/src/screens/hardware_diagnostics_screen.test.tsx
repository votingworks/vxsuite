import { mockUsbDriveStatus } from '@votingworks/ui';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { createApiMock, ApiMock } from '../../test/api';
import { HardwareDiagnosticsScreen } from './hardware_diagnostics_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: false,
  });
  apiMock.expectGetApplicationDiskSpaceSummary({
    total: 1_000_000_000,
    available: 500_000_000,
    used: 500_000_000,
  });
  apiMock.setUsbDriveStatus(mockUsbDriveStatus('mounted'));
});

afterEach(() => {
  apiMock.assertComplete();
});

test('hardware diagnostics screen', async () => {
  apiMock.setStatus();
  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetMostRecentScannerDiagnostic();

  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText('No election currently loaded on device.');
  screen.getByText('Battery Level: 50%');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
  screen.getByText('Connected');
  screen.getByText('No test scan on record');
});

test('shows most recent diagnostic', async () => {
  apiMock.setStatus();
  apiMock.expectGetElectionDefinition(electionTwoPartyPrimaryDefinition);
  apiMock.expectGetMostRecentScannerDiagnostic({
    type: 'blank-sheet-scan',
    outcome: 'pass',
    timestamp: new Date('2021-01-01T00:00:00').getTime(),
  });

  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText(/Example Primary Election/);
  screen.getByText('Battery Level: 50%');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
  screen.getByText('Connected');
  screen.getByText('Test scan successful, 1/1/2021, 12:00:00 AM');
});
