import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';
import { SystemAdministratorScreen } from './system_administrator_screen';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000'));
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.mockApiClient.assertComplete();
});

test('SystemAdministratorScreen renders expected contents', () => {
  const unconfigureMachine = jest.fn();
  render(
    <SystemAdministratorScreen
      unconfigureMachine={unconfigureMachine}
      isMachineConfigured
    />
  );

  // These buttons are further tested in libs/ui
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  screen.getByRole('button', { name: 'Unconfigure Machine' });
});

test('Can set date and time', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={jest.fn()}
        isMachineConfigured
      />
    )
  );
  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getButton('Set Date and Time'));
  apiMock.mockApiClient.setClock
    .expectCallWith({
      isoDatetime: '2020-10-31T00:00:00.000-08:00',
      ianaZone: 'America/Anchorage',
    })
    .resolves();
  apiMock.expectLogOut();
  userEvent.click(screen.getButton('Save'));
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});

test('navigates to System Diagnostics screen', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        unconfigureMachine={jest.fn()}
        isMachineConfigured
      />
    )
  );

  apiMock.expectGetElectionDefinition(null);
  apiMock.expectGetElectionState();
  apiMock.setBatteryInfo();
  apiMock.expectGetIsAccessibleControllerInputDetected();
  apiMock.expectGetMostRecentAccessibleControllerDiagnostic();
  apiMock.expectGetApplicationDiskSpaceSummary();

  userEvent.click(screen.getButton('System Diagnostics'));
  screen.getByRole('heading', { name: 'System Diagnostics' });

  userEvent.click(await screen.findButton('Back'));
  screen.getButton('System Diagnostics');
});
