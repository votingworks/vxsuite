import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { createApiMock, ApiMock } from '../../test/api';
import { HardwareDiagnosticsScreen } from './hardware_diagnostics_screen';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('hardware diagnostics screen', async () => {
  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: false,
  });
  apiMock.expectGetApplicationDiskSpaceSummary({
    total: 1_000_000_000,
    available: 500_000_000,
    used: 500_000_000,
  });
  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText('Battery Level: 50%');
  screen.getByText('Free Disk Space: 50% (500 GB / 1000 GB)');
});
