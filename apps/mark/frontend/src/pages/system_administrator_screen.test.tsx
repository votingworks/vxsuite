import { fakeLogger } from '@votingworks/logging';
import { mockUsbDriveStatus } from '@votingworks/ui';
import userEvent from '@testing-library/user-event';
import { fakeKiosk } from '@votingworks/test-utils';
import { screen, waitFor } from '../../test/react_testing_library';

import { render } from '../../test/test_utils';
import {
  ApiMock,
  createApiMock,
  provideApi,
} from '../../test/helpers/mock_api_client';
import { SystemAdministratorScreen } from './system_administrator_screen';

let apiMock: ApiMock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2020-10-31T00:00:00.000Z'));
  apiMock = createApiMock();
  window.kiosk = fakeKiosk();
});

afterEach(() => {
  window.kiosk = undefined;
  apiMock.mockApiClient.assertComplete();
});

test('SystemAdministratorScreen renders expected contents', () => {
  const logger = fakeLogger();
  const unconfigureMachine = jest.fn();
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        logger={logger}
        unconfigureMachine={unconfigureMachine}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('mounted')}
      />
    )
  );

  // These buttons are further tested in libs/ui
  screen.getByRole('button', { name: 'Reboot from USB' });
  screen.getByRole('button', { name: 'Reboot to BIOS' });
  screen.getByRole('button', { name: 'Unconfigure Machine' });
});

test('Can set date and time', async () => {
  render(
    provideApi(
      apiMock,
      <SystemAdministratorScreen
        logger={fakeLogger()}
        unconfigureMachine={jest.fn()}
        isMachineConfigured
        usbDriveStatus={mockUsbDriveStatus('no_drive')}
      />
    )
  );
  // We just do a simple happy path test here, since the libs/ui/set_clock unit
  // tests cover full behavior
  userEvent.click(screen.getButton('Set Date and Time'));
  apiMock.expectLogOut();
  userEvent.click(screen.getButton('Save'));
  expect(window.kiosk?.setClock).toHaveBeenCalledWith({
    isoDatetime: '2020-10-31T00:00:00.000+00:00',
    // eslint-disable-next-line vx/gts-identifiers
    IANAZone: 'UTC',
  });
  await waitFor(() =>
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  );
});
