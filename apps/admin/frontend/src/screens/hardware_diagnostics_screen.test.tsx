import { hasTextAcrossElements } from '@votingworks/test-utils';
import { screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { HardwareDiagnosticsScreen } from './hardware_diagnostics_screen';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2022-06-22T00:00:00.000Z'));
  apiMock = createApiMock();
});

afterEach(() => {
  jest.useRealTimers();
  apiMock.assertComplete();
});

test('displays battery state ', async () => {
  apiMock.setPrinterStatus({ connected: false });
  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText(
    hasTextAcrossElements('Power Source: External Power Supply')
  );
  screen.getByText(hasTextAcrossElements('Battery Level: 100%'));

  apiMock.setBatteryInfo({
    level: 0.5,
    discharging: true,
  });

  await screen.findByText(hasTextAcrossElements('Power Source: Battery'));
  screen.getByText(hasTextAcrossElements('Battery Level: 50%'));
});

test('displays printer state ', async () => {
  apiMock.setPrinterStatus({ connected: false });
  renderInAppContext(<HardwareDiagnosticsScreen />, {
    apiMock,
  });

  await screen.findByText('No compatible printer detected');

  apiMock.setPrinterStatus({
    connected: true,
  });

  await screen.findByText('Connected');
});
